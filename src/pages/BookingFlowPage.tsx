import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getPatients, addPatient } from "@/services/patientService";
import { getAddresses, addAddress, updateAddress } from "@/services/addressService";
import type { Address } from "@/types/address";
import { checkServiceability } from "@/services/serviceabilityService";
import { subscribeToSlots } from "@/services/slotService";
import { formatCurrencyInr } from "@/services/pricingService";
import { createCashBooking, type GetBookingQuoteResponse } from "@/services/bookingService";
import { updateUserProfile } from "@/services/userService";
import type { CollectionType } from "@/types/booking";
import type { Slot } from "@/types/slot";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import BookingStepper from "@/components/common/BookingStepper";
import PhoneNumberModal from "@/components/common/PhoneNumberModal";
import { isCallableUnavailable, logOperationError, toUserMessage } from "@/utils/errors";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { buildWhatsAppLink } from "@/utils/whatsappBooking";
import { isValidIndianMobile, normalizeIndianMobile } from "@/utils/phone";

// ProtectedRoute already sends a logged-out visitor to /login (state:
// {from: location}) before this page can ever mount — but LoginPage's
// own redirect-back only ever carried the pathname, not the original
// location.state, so the test/package the customer picked before being
// sent to log in was silently lost, landing them on "Nothing selected
// yet" right after signing in. Persisting it here (and re-reading it
// below when router state is empty) survives that whole detour,
// including a real Google OAuth redirect, which cannot carry React
// Router state through it at all.
const PENDING_SELECTION_KEY = "mh_pending_booking_selection";

function readStoredSelection(): BookingSelection | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SELECTION_KEY);
    return raw ? (JSON.parse(raw) as BookingSelection) : null;
  } catch {
    return null;
  }
}

interface BookingSelection {
  itemType: "test" | "package";
  refId: string;
  name: string;
  labId: string;
  price: number; // display-only — create_website_booking re-derives it server-side from pricingRefId
  /** pricing row the price came from; the RPC verifies against it. */
  pricingRefId?: string;
  labName?: string;
}

// No coupon step: redeeming a coupon means incrementing its usage
// counters atomically, which a browser cannot do safely. Coupons are
// applied by staff on an admin-created booking instead.
const STEPS = ["patient", "collection", "schedule", "payment", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  patient: "Patient",
  collection: "Collection",
  schedule: "Date & slot",
  payment: "Payment",
  review: "Review",
};

export default function BookingFlowPage() {
  // patients/addresses/bookings are keyed by the Supabase uuid, never
  // the Firebase user.uid (see src/supabase/identity.ts) — user itself
  // is still needed for display fields (displayName/phoneNumber).
  const { user, profile, supabaseUserId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routerSelection = location.state as BookingSelection | null;
  const selection = routerSelection ?? readStoredSelection();

  // A real selection just arrived via navigation — keep it around in
  // case a login/signup detour is about to unmount this page.
  useEffect(() => {
    if (routerSelection) {
      try {
        sessionStorage.setItem(PENDING_SELECTION_KEY, JSON.stringify(routerSelection));
      } catch {
        // best-effort only — worst case is the pre-login-redirect bug
        // this exists to fix, not a broken booking.
      }
    }
  }, [routerSelection]);

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [patientId, setPatientId] = useState<string | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);

  // Booking contact number — who our team calls about THIS booking.
  // Seeded from the signed-in profile/account so a customer who
  // already has one on file is never asked to retype it, but it stays
  // a real, editable field: profile?.phone can be stale, and a Google
  // account may have no phone at all (user.phoneNumber only exists for
  // the Firebase-phone-OTP auth path — see src/types/authUser.ts).
  const [phone, setPhone] = useState(() => profile?.phone ?? user?.phoneNumber ?? "");
  // Opens PhoneNumberModal — the ONLY place this number is entered or
  // changed. There is deliberately no permanent expanded input on the
  // page itself: a customer with a valid number on file sees a small
  // confirmation chip, one who doesn't sees a compact prompt, and both
  // lead to the same modal rather than an ever-present form section.
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  // useAuth() resolves asynchronously — on first render `profile` is
  // often still null, so the useState initializer above can seed an
  // empty phone even for a customer who genuinely has one on file.
  // Fills it in once the real value arrives, but only while the field
  // is still untouched (empty) — never overwrites something the
  // customer has already started typing.
  useEffect(() => {
    const known = profile?.phone ?? user?.phoneNumber ?? "";
    if (known && !phone) {
      setPhone(known);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.phone, user?.phoneNumber]);

  function handlePhoneConfirmed(nextPhone: string) {
    setPhone(nextPhone);
    setPhoneModalOpen(false);
    // Best-effort only: the booking's own contact.phone snapshot (sent
    // from this same `phone` state in handleConfirm below) is what
    // actually matters for THIS booking and never depends on this
    // write succeeding — this just saves a re-ask next time.
    if (supabaseUserId) {
      void updateUserProfile(supabaseUserId, { phone: nextPhone }).catch(() => {});
    }
  }
  // Optional landmark/gate/collection note — never sent anywhere
  // internal (no tp, no margin), just a note for whoever collects the
  // sample. Deliberately free-text, deliberately optional.
  const [instructions, setInstructions] = useState("");

  const [collectionType, setCollectionType] = useState<CollectionType>("home");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [pincode, setPincode] = useState("");
  const [pincodeChecked, setPincodeChecked] = useState<
    { areaId: string; collectionFee: number; available: boolean } | null
  >(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [slotId, setSlotId] = useState<string | null>(null);

  // What the customer is shown as "what you'll pay". Composed in
  // fetchQuote() below and re-verified server-side by
  // create_website_booking (the RPC, not the browser) on write.
  const [quote, setQuote] = useState<GetBookingQuoteResponse | null>(null);
  const quoteLoading = false;
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [creatingBooking, setCreatingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  // Distinguishes "the server rejected this booking" (retryable) from
  // "the booking backend is not reachable at all" (not retryable).
  const [bookingUnavailable, setBookingUnavailable] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<{ bookingId: string; finalAmount: number } | null>(null);

  const { settings } = useBrandingSettings();
  const contactPhone = settings?.phone?.trim() || null;

  const patients = useAsync(() => (supabaseUserId ? getPatients(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);
  const addresses = useAsync(() => (supabaseUserId ? getAddresses(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);

  const nextSevenDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, []);

  // Realtime — a slot filling up while the customer is on this exact
  // step is the highest-value place for a live listener in the whole
  // booking flow (it's the one Firestore write, from createBooking's
  // transaction, that can genuinely change what's showing here while
  // they're mid-decision). Properly unsubscribed on every dependency
  // change and on unmount.
  const [slotsState, setSlotsState] = useState<{ data: Slot[] | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!pincodeChecked) {
      setSlotsState({ data: [], loading: false, error: null });
      return;
    }
    // Unlike patients/addresses' own retry, this effect re-runs because
    // the DATE (or collection type) actually changed — the previous
    // slots belong to a different day and must not stay on screen
    // looking selectable while the new day's list loads underneath.
    setSlotsState({ data: null, loading: true, error: null });
    const unsubscribe = subscribeToSlots(
      pincodeChecked.areaId,
      date,
      collectionType,
      (slots) => setSlotsState({ data: slots, loading: false, error: null }),
      (err) => setSlotsState({ data: null, loading: false, error: toUserMessage(err) })
    );
    return unsubscribe;
  }, [pincodeChecked?.areaId, date, collectionType]);
  const slots = {
    ...slotsState,
    retry: () => {
      // Realtime listeners recover on their own; "retry" just clears a
      // transient error so the next snapshot can render normally.
      setSlotsState((s) => ({ ...s, error: null }));
    },
  };

  if (!selection) {
    return (
      <EmptyState
        icon="science"
        title="Nothing selected yet"
        description="Pick a test or package first, then choose a lab to book."
        action={{ label: "Browse tests", onClick: () => navigate("/tests") }}
      />
    );
  }

  // Re-bind to a definitely-non-null const so the handlers/closures
  // defined below (which TS can't narrow `selection` through) are typed
  // correctly without repeated non-null assertions.
  const sel: BookingSelection = selection;

  // Fallback route when automatic booking is unavailable: hand the
  // customer's own details to the business over WhatsApp so a human can
  // complete the booking. Uses the configured business number only —
  // nothing is sent automatically, the customer taps to open WhatsApp.
  const whatsappBusiness = settings?.whatsapp?.trim() || settings?.phone?.trim() || "";
  const whatsappLink = whatsappBusiness
    ? buildWhatsAppLink(
        whatsappBusiness,
        [
          "Booking request",
          "",
          `Item: ${sel.name}`,
          quote ? `Amount: ₹${quote.finalAmount.toLocaleString("en-IN")}` : "",
          `Collection: ${collectionType === "home" ? "Home" : "Center"}`,
          date ? `Preferred date: ${date}` : "",
          pincode ? `Pincode: ${pincode}` : "",
          "Payment: Cash on Home",
        ]
          .filter(Boolean)
          .join("\n")
      )
    : null;

  // The price shown before confirming.
  //
  // On this deployment there is no pricing Cloud Function, so the total
  // is composed here from the two catalogue figures the customer has
  // already been shown: the lab's price for this item, and the
  // collection fee stored on their serviced pincode. That is safe
  // because it is not the authority — firestore.rules re-derives both
  // from `pricingRefId` and `serviceAreaId` when the booking is written
  // and rejects anything that disagrees. Coupons are absent by design:
  // redeeming one needs atomic usage counters a browser cannot do.
  function fetchQuote() {
    if (!patientId || !pincodeChecked?.available) return;
    setQuoteError(null);

    const collectionFee = collectionType === "home" ? pincodeChecked.collectionFee : 0;
    const subtotal = sel.price;

    setQuote({
      quoteId: "",
      subtotal,
      collectionFee,
      discount: 0,
      finalAmount: subtotal + collectionFee,
      currency: "INR",
      couponApplied: false,
      expiresAt: "",
    });
  }

  // Takes the pincode as an argument rather than always reading state —
  // callers that just changed `pincode` in the same tick (picking a
  // different saved address) would otherwise close over the value from
  // BEFORE that update lands, and re-check the address they left.
  async function runServiceabilityCheck(pin: string) {
    const area = await checkServiceability(pin);
    if (!area) {
      setPincodeChecked({ areaId: "", collectionFee: 0, available: false });
      return;
    }
    setPincodeChecked({ areaId: area.id, collectionFee: area.collectionFee, available: area.homeCollectionAvailable || collectionType === "center" });
  }

  async function handleCheckPincode() {
    await runServiceabilityCheck(pincode);
  }

  function handleNext() {
    if (step === "collection") {
      // Leaving the step that determines lab/collection type/area — get
      // (or refresh) the authoritative quote before the customer sees a
      // coupon or review screen.
      fetchQuote();
    }
    setStepIndex((i) => i + 1);
  }

  async function handleConfirm() {
    if (!user || !supabaseUserId || !patientId || !slotId || !pincodeChecked?.available || !quote) return;
    setCreatingBooking(true);
    setBookingError(null);
    try {
      // create_website_booking is a SECURITY DEFINER Supabase RPC:
      // it re-derives the price from pricingRefId, the fee from
      // serviceAreaId, and pins the booking to start unpaid server-side
      // — so nothing here has to be trusted for the booking to be
      // correct. (userId below is accepted for shape/back-compat only;
      // the RPC uses the live session's own auth.uid(), never this
      // value.)
      const result = await createCashBooking({
        userId: supabaseUserId,
        patientId,
        item: { itemType: sel.itemType, refId: sel.refId, name: sel.name, labId: sel.labId, price: sel.price },
        pricingRefId: sel.pricingRefId ?? "",
        serviceAreaId: pincodeChecked.areaId,
        labId: sel.labId,
        labName: sel.labName,
        collectionType,
        addressId: collectionType === "home" ? addressId ?? undefined : undefined,
        pincode,
        collectionFee: quote.collectionFee,
        date,
        slotId,
        contact: {
          name: profile?.name ?? user.displayName ?? undefined,
          // The number confirmed/edited on the "Who is this test for?"
          // step — not the raw profile value, which may be stale or
          // (for a Google/email account) not exist at all.
          phone: normalizeIndianMobile(phone),
        },
        notes: instructions.trim() || undefined,
      });
      setCreatedBooking(result);
      try {
        sessionStorage.removeItem(PENDING_SELECTION_KEY);
      } catch {
        // non-fatal — the booking itself already succeeded
      }
      // justBooked only lives in router state for this one navigation,
      // so TrackBookingPage can show a one-time success banner right
      // after a fresh booking without showing it again on every later
      // visit to the same tracking link.
      navigate(`/track/${result.bookingId}`, { replace: true, state: { justBooked: true } });
    } catch (err) {
      // Two very different things land here and the customer deserves
      // to be told which. A server-side validation failure (price, slot
      // or coupon changed since the quote) means nothing was created
      // and re-submitting is the fix. An unreachable callable means the
      // booking backend simply is not running, which no amount of
      // retrying will change — so say so plainly instead of offering a
      // retry that cannot succeed.
      logOperationError("createBooking", err, { collectionType, date });
      setBookingUnavailable(isCallableUnavailable(err));
      setBookingError(toUserMessage(err));
    } finally {
      setCreatingBooking(false);
    }
  }

  function canGoNext(): boolean {
    switch (step) {
      case "patient":
        return !!patientId && isValidIndianMobile(phone);
      case "collection":
        if (collectionType === "home" && !addressId) return false;
        return !!pincodeChecked?.available;
      case "schedule":
        return !!slotId;
      default:
        return true;
    }
  }

  return (
    <div className="mh-booking">
      <div className="mh-booking__head">
        <button className="mh-pkgdetail__back" onClick={() => navigate(-1)} aria-label="Go back">
          <span className="mi" aria-hidden="true">arrow_back</span>
        </button>
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Book a Test / Package</p>
          <h1 style={{ fontSize: "var(--text-lg)" }}>{sel.name}</h1>
        </div>
      </div>

      <BookingStepper steps={STEPS} labels={STEP_LABELS} activeIndex={stepIndex} />

      {step === "patient" && (
        <section className="mh-booking__section">
          <h2 className="mh-booking__section-title">Who is this test for?</h2>
          {/* Only the FIRST load shows a skeleton — a retry after adding a
              member keeps the previous list visible (useAsync's own
              contract: `data` isn't cleared while `loading` is true), so
              gating this on `!patients.data` too stops a loading
              skeleton from flashing in above the still-valid list on
              every refetch. */}
          {patients.loading && !patients.data && <LoadingState rows={2} />}
          {patients.error && <ErrorState message={patients.error} onRetry={patients.retry} />}
          {patients.data && (
            <div className="mh-select-list">
              {patients.data.map((p) => (
                <button
                  key={p.id}
                  className={`mh-select-card${patientId === p.id ? " is-selected" : ""}`}
                  onClick={() => setPatientId(p.id)}
                >
                  <span className="mh-select-card__icon" aria-hidden="true">
                    <span className="mi">person</span>
                  </span>
                  <span className="mh-select-card__body">
                    <span className="mh-select-card__title">{p.name}</span>
                    <span className="mh-select-card__meta">{p.relationship}</span>
                  </span>
                  {patientId === p.id && (
                    <span className="mh-select-card__check" aria-hidden="true">
                      <span className="mi">check_circle</span>
                    </span>
                  )}
                </button>
              ))}
              {!showAddPatient && (
                <button className="mh-add-row" onClick={() => setShowAddPatient(true)}>
                  <span className="mi" aria-hidden="true">add_circle</span>
                  Add a family member
                </button>
              )}
              {showAddPatient && supabaseUserId && (
                <QuickAddPatientForm
                  userId={supabaseUserId}
                  onAdded={(id) => {
                    setPatientId(id);
                    setShowAddPatient(false);
                    patients.retry();
                  }}
                  onCancel={() => setShowAddPatient(false)}
                />
              )}
            </div>
          )}

          <div className="mh-contact-phone" style={{ marginTop: "var(--space-md)" }}>
            {isValidIndianMobile(phone) ? (
              // Case C (Section 12): already have a good number — a
              // small confirmation chip, not a permanent form section.
              <div className="mh-select-card is-selected" style={{ cursor: "default" }}>
                <span className="mh-select-card__icon" aria-hidden="true">
                  <span className="mi">call</span>
                </span>
                <span className="mh-select-card__body">
                  <span className="mh-select-card__title">Contact number +91 {normalizeIndianMobile(phone)}</span>
                </span>
                <button type="button" className="btn btn-outline" onClick={() => setPhoneModalOpen(true)}>
                  Change
                </button>
              </div>
            ) : (
              // Case B: logged in but nothing valid on file yet — a
              // compact prompt that opens the explanatory modal, never
              // a bare input dropped straight into the page.
              <button type="button" className="mh-add-row" onClick={() => setPhoneModalOpen(true)}>
                <span className="mi" aria-hidden="true">call</span>
                Add your phone number
              </button>
            )}
          </div>
        </section>
      )}

      {phoneModalOpen && (
        <PhoneNumberModal
          initialPhone={phone}
          title={isValidIndianMobile(phone) ? "Change contact number" : "Add your phone number"}
          description={
            isValidIndianMobile(phone)
              ? undefined
              : "We need a working number to confirm this booking and send updates as your sample is collected — our team will only call about this booking."
          }
          onCancel={() => setPhoneModalOpen(false)}
          onConfirm={handlePhoneConfirmed}
        />
      )}

      {step === "collection" && (
        <section className="mh-booking__section" style={{ display: "grid", gap: "var(--space-md)" }}>
          <div>
            <h2 className="mh-booking__section-title">Collection type</h2>
            <div className="mh-toggle-row">
              <button
                className={`mh-toggle-btn${collectionType === "home" ? " is-active" : ""}`}
                onClick={() => setCollectionType("home")}
              >
                <span className="mi" aria-hidden="true">home</span>
                Home collection
              </button>
              <button
                className={`mh-toggle-btn${collectionType === "center" ? " is-active" : ""}`}
                onClick={() => setCollectionType("center")}
              >
                <span className="mi" aria-hidden="true">storefront</span>
                Center visit
              </button>
            </div>
          </div>

          <div>
            <h2 className="mh-booking__section-title">Check serviceability</h2>
            <div className="mh-pincode-row">
              <input
                value={pincode}
                onChange={(e) => {
                  setPincode(e.target.value);
                  // The last Check result belonged to whatever pincode
                  // was in the box before this edit — once the digits
                  // change it's unverified again, so the stale
                  // available/unavailable message (and any slots for
                  // the old area) must not keep showing as if it still
                  // applied.
                  setPincodeChecked(null);
                }}
                placeholder="Enter pincode"
                className="mh-pincode-row__input"
              />
              <button className="btn btn-outline" onClick={handleCheckPincode}>
                Check
              </button>
            </div>
            {pincodeChecked && !pincodeChecked.available && (
              <p className="mh-service-msg is-danger">
                <span className="mi" aria-hidden="true">error</span>
                Service not available at this pincode yet.
              </p>
            )}
            {pincodeChecked && pincodeChecked.available && (
              <p className="mh-service-msg is-success">
                <span className="mi" aria-hidden="true">check_circle</span>
                Service available — exact pricing is confirmed on the next step.
              </p>
            )}
          </div>

          {collectionType === "home" && (
            <div>
              <h2 className="mh-booking__section-title">Delivery / Collection Address</h2>
              {addresses.loading && !addresses.data && <LoadingState rows={2} />}
              {addresses.error && <ErrorState message={addresses.error} onRetry={addresses.retry} />}
              {addresses.data && (
                <div className="mh-select-list">
                  {addresses.data.length === 0 && !showAddAddress && (
                    <EmptyState icon="location_on" title="No saved addresses yet" description="Add one below to continue." />
                  )}
                  {addresses.data.map((a) => (
                    <div key={a.id} className="mh-select-card-row">
                      <button
                        className={`mh-select-card${addressId === a.id ? " is-selected" : ""}`}
                        onClick={() => {
                          setAddressId(a.id);
                          setPincode(a.pincode);
                          // A previous address's serviceability result
                          // must not keep showing "available" (and its
                          // area's slots must not keep loading) once a
                          // DIFFERENT address is selected.
                          setPincodeChecked(null);
                          void runServiceabilityCheck(a.pincode);
                        }}
                      >
                        <span className="mh-select-card__icon" aria-hidden="true">
                          <span className="mi">location_on</span>
                        </span>
                        <span className="mh-select-card__body">
                          <span className="mh-select-card__title">
                            {a.label} {a.isDefault && <em>(Default)</em>}
                          </span>
                          <span className="mh-select-card__meta">
                            {a.house}, {a.street}, {a.city} {a.pincode}
                          </span>
                        </span>
                        {addressId === a.id && (
                          <span className="mh-select-card__check" aria-hidden="true">
                            <span className="mi">check_circle</span>
                          </span>
                        )}
                      </button>
                      {/* Sibling, not nested — a <button> inside the
                          select-card <button> would be invalid HTML.
                          Editing an address here (instead of only from
                          /profile/addresses) means a typo spotted mid-
                          booking (wrong pincode, wrong floor) doesn't
                          force abandoning the flow to go fix it. */}
                      <button
                        type="button"
                        className="mh-edit-btn"
                        aria-label={`Edit ${a.label} address`}
                        onClick={() => {
                          setShowAddAddress(false);
                          setEditingAddress(a);
                        }}
                      >
                        <span className="mi" aria-hidden="true">edit</span>
                      </button>
                    </div>
                  ))}
                  {/* Always available, list empty or not — this used to
                      only exist inside the empty-list EmptyState (and
                      navigated away to /addresses), so once a customer
                      had one saved address there was no way left to add
                      a second without leaving the booking flow. */}
                  {!showAddAddress && !editingAddress && (
                    <button className="mh-add-row" onClick={() => setShowAddAddress(true)}>
                      <span className="mi" aria-hidden="true">add_circle</span>
                      Add a new address
                    </button>
                  )}
                  {(showAddAddress || editingAddress) && supabaseUserId && (
                    <QuickAddAddressForm
                      key={editingAddress?.id ?? "new"}
                      userId={supabaseUserId}
                      editAddress={editingAddress ?? undefined}
                      onAdded={(id, savedPincode) => {
                        setAddressId(id);
                        setPincode(savedPincode);
                        // Without this, a customer who adds/edits an
                        // address and never separately presses "Check"
                        // above ends up with pincodeChecked staying
                        // null forever — which (see the slots effect)
                        // means the Schedule step shows zero slots and
                        // the booking can never continue.
                        setPincodeChecked(null);
                        void runServiceabilityCheck(savedPincode);
                        setShowAddAddress(false);
                        setEditingAddress(null);
                        addresses.retry();
                      }}
                      onCancel={() => {
                        setShowAddAddress(false);
                        setEditingAddress(null);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {step === "schedule" && (
        <section className="mh-booking__section" style={{ display: "grid", gap: "var(--space-md)" }}>
          <div>
            <h2 className="mh-booking__section-title">Select Date &amp; Time</h2>
            <div className="mh-date-row mh-hscroll">
              {nextSevenDays.map((d) => {
                const dt = new Date(d);
                return (
                  <button
                    key={d}
                    className={`mh-date-card${date === d ? " is-active" : ""}`}
                    onClick={() => {
                      setDate(d);
                      setSlotId(null);
                    }}
                  >
                    <span className="mh-date-card__day">{dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="mh-date-card__num">{dt.getDate()}</span>
                    <span className="mh-date-card__month">{dt.toLocaleDateString(undefined, { month: "short" })}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h2 className="mh-booking__section-title">Available slots</h2>
            {slots.loading && <LoadingState rows={2} />}
            {slots.error && <ErrorState message={slots.error} onRetry={slots.retry} />}
            {slots.data && slots.data.length === 0 && (
              <EmptyState icon="event_busy" title="No slots available for this date" description="Try another date." />
            )}
            {slots.data && slots.data.length > 0 && (
              <div className="mh-slot-grid">
                {slots.data.map((s) => {
                  const full = s.bookedCount >= s.capacity;
                  return (
                    <button
                      key={s.id}
                      className={`mh-slot-btn${slotId === s.id ? " is-active" : ""}`}
                      disabled={full}
                      onClick={() => setSlotId(s.id)}
                    >
                      {s.startTime}–{s.endTime}
                      {full && <span className="mh-slot-btn__full">Full</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {step === "payment" && (
        <section className="mh-booking__section">
          <h2 className="mh-booking__section-title">Payment Method</h2>
          {/* Cash on home is the only method offered. It is shown as a
              settled choice rather than a one-option picker, because a
              list you cannot choose differently from is just noise. No
              UPI/card/wallet/netbanking option exists in this product. */}
          <div className="mh-payment-card is-selected">
            <span className="mh-payment-card__icon" aria-hidden="true">
              <span className="mi">payments</span>
            </span>
            <div>
              <p className="mh-payment-card__title">Cash on Home</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                Pay the collection agent in cash when they visit. Nothing is charged now.
              </p>
            </div>
            <span className="mh-payment-card__check" aria-hidden="true">
              <span className="mi">check_circle</span>
            </span>
          </div>
        </section>
      )}

      {step === "review" && (
        <section className="mh-booking__section" style={{ display: "grid", gap: "var(--space-sm)" }}>
          <h2 className="mh-booking__section-title">Review &amp; Confirm</h2>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Special instructions <span className="text-soft">(optional)</span>
            </span>
            <textarea
              rows={2}
              maxLength={500}
              placeholder="Landmark, gate/security note, or anything the collector should know"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>

          {quoteLoading && <LoadingState label="Getting the latest price..." rows={2} />}
          {quoteError && <ErrorState message={quoteError} onRetry={() => fetchQuote()} />}

          {quote && (
            <>
              <div className="mh-order-summary">
                <p className="mh-order-summary__title">Order Summary</p>
                <Row label="Subtotal" value={formatCurrencyInr(quote.subtotal)} />
                <Row label="Home Collection Charges" value={formatCurrencyInr(quote.collectionFee)} />
                <Row label="Discount" value={`- ${formatCurrencyInr(quote.discount)}`} />
                <hr className="mh-order-summary__rule" />
                <Row label="Total Amount" value={formatCurrencyInr(quote.finalAmount)} bold />
                <Row label="Payment method" value="Cash on Home" />
              </div>
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                This is the price the server will actually charge — not an estimate. Nothing is
                charged online; you pay the collection agent in cash.
              </p>
            </>
          )}

          {/* An unreachable booking backend is not a retryable error, so
              it gets its own honest message and a way to reach a human
              rather than a Retry button that cannot ever succeed. */}
          {bookingUnavailable ? (
            <div className="card" style={{ display: "grid", gap: "var(--space-sm)", borderColor: "var(--color-amber)" }}>
              <p style={{ fontWeight: 700 }}>Booking confirmation is temporarily unavailable</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                We could not complete your booking automatically. Nothing has been charged and no
                booking was created. Please contact us and we will book this for you.
              </p>
              {contactPhone && (
                <a className="btn btn-primary" href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
                  Call {contactPhone} to book
                </a>
              )}
              {whatsappLink && (
                <a className="btn btn-outline" href={whatsappLink} target="_blank" rel="noreferrer">
                  Send these details on WhatsApp
                </a>
              )}
            </div>
          ) : (
            bookingError && <ErrorState message={bookingError} />
          )}

          {!createdBooking && !bookingUnavailable && (
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleConfirm}
              disabled={creatingBooking || !quote || quoteLoading}
            >
              {creatingBooking ? "Confirming..." : quote ? `Confirm Booking — ${formatCurrencyInr(quote.finalAmount)}` : "Confirm booking"}
            </button>
          )}
        </section>
      )}

      <div className="mh-booking__nav">
        <button
          className="btn btn-outline"
          disabled={stepIndex === 0 || !!createdBooking}
          onClick={() => setStepIndex((i) => i - 1)}
        >
          Back
        </button>
        {step !== "review" && (
          <button className="btn btn-primary" disabled={!canGoNext()} onClick={handleNext}>
            Continue
            <span className="mi" aria-hidden="true">arrow_forward</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`mh-order-summary__row${bold ? " is-total" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function QuickAddPatientForm({
  userId,
  onAdded,
  onCancel,
}: {
  userId: string;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<"self" | "father" | "mother" | "spouse" | "son" | "daughter" | "other">("self");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await addPatient(userId, { name, relationship, dob, gender });
      onAdded(id);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
      <input placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
      <select value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)}>
        {["self", "father", "mother", "spouse", "son", "daughter", "other"].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
      <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
      </select>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Same field set as AddressesPage.tsx's own AddAddressForm — kept in
// sync deliberately, since both write the exact same addresses row
// shape. This one lives inline in the booking flow so adding a second
// (or first) address never requires leaving mid-booking.
function QuickAddAddressForm({
  userId,
  editAddress,
  onAdded,
  onCancel,
}: {
  userId: string;
  editAddress?: Address;
  onAdded: (id: string, pincode: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() =>
    editAddress
      ? {
          label: editAddress.label,
          house: editAddress.house,
          street: editAddress.street,
          area: editAddress.area,
          city: editAddress.city,
          state: editAddress.state,
          pincode: editAddress.pincode,
          landmark: editAddress.landmark ?? "",
        }
      : { label: "Home", house: "", street: "", area: "", city: "", state: "", pincode: "", landmark: "" }
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editAddress) {
        await updateAddress(editAddress.id, form);
        onAdded(editAddress.id, form.pincode);
      } else {
        const id = await addAddress(userId, form);
        onAdded(id, form.pincode);
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
      <input placeholder="Label (Home / Work)" required value={form.label} onChange={(e) => update("label", e.target.value)} />
      <input placeholder="House / flat no." required value={form.house} onChange={(e) => update("house", e.target.value)} />
      <input placeholder="Street" required value={form.street} onChange={(e) => update("street", e.target.value)} />
      <input placeholder="Area" required value={form.area} onChange={(e) => update("area", e.target.value)} />
      <input placeholder="City" required value={form.city} onChange={(e) => update("city", e.target.value)} />
      <input placeholder="State" required value={form.state} onChange={(e) => update("state", e.target.value)} />
      <input placeholder="Pincode" required value={form.pincode} onChange={(e) => update("pincode", e.target.value)} />
      <input placeholder="Landmark (optional)" value={form.landmark} onChange={(e) => update("landmark", e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
          {busy ? "Saving..." : editAddress ? "Save changes" : "Save address"}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
