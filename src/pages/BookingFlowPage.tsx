import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getPatients, addPatient } from "@/services/patientService";
import { getAddresses } from "@/services/addressService";
import { checkServiceability } from "@/services/serviceabilityService";
import { subscribeToSlots } from "@/services/slotService";
import { formatCurrencyInr } from "@/services/pricingService";
import { createCashBooking, type GetBookingQuoteResponse } from "@/services/bookingService";
import type { CollectionType } from "@/types/booking";
import type { Slot } from "@/types/slot";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import BookingStepper from "@/components/common/BookingStepper";
import { isCallableUnavailable, logOperationError, toUserMessage } from "@/utils/errors";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { buildWhatsAppLink } from "@/utils/whatsappBooking";

interface BookingSelection {
  itemType: "test" | "package";
  refId: string;
  name: string;
  labId: string;
  price: number; // display-only — firestore.rules re-derives it from pricingRefId
  /** labPricing document the price came from; the rules verify against it. */
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
  const selection = location.state as BookingSelection | null;

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [patientId, setPatientId] = useState<string | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);

  const [collectionType, setCollectionType] = useState<CollectionType>("home");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [pincode, setPincode] = useState("");
  const [pincodeChecked, setPincodeChecked] = useState<
    { areaId: string; collectionFee: number; available: boolean } | null
  >(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [slotId, setSlotId] = useState<string | null>(null);

  // What the customer is shown as "what you'll pay". Composed in
  // fetchQuote() below and re-verified by firestore.rules on write.
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
    setSlotsState((s) => ({ ...s, loading: true, error: null }));
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

  async function handleCheckPincode() {
    const area = await checkServiceability(pincode);
    if (!area) {
      setPincodeChecked({ areaId: "", collectionFee: 0, available: false });
      return;
    }
    setPincodeChecked({ areaId: area.id, collectionFee: area.collectionFee, available: area.homeCollectionAvailable || collectionType === "center" });
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
          phone: profile?.phone ?? user.phoneNumber ?? undefined,
        },
      });
      setCreatedBooking(result);
      navigate(`/track/${result.bookingId}`, { replace: true });
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
        return !!patientId;
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
          {patients.loading && <LoadingState rows={2} />}
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
                />
              )}
            </div>
          )}
        </section>
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
                onChange={(e) => setPincode(e.target.value)}
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
              {addresses.loading && <LoadingState rows={2} />}
              {addresses.error && <ErrorState message={addresses.error} onRetry={addresses.retry} />}
              {addresses.data && addresses.data.length === 0 && (
                <EmptyState
                  icon="location_on"
                  title="No saved addresses"
                  description="Add one from your profile before booking home collection."
                  action={{ label: "Add address", onClick: () => navigate("/addresses") }}
                />
              )}
              {addresses.data && addresses.data.length > 0 && (
                <div className="mh-select-list">
                  {addresses.data.map((a) => (
                    <button
                      key={a.id}
                      className={`mh-select-card${addressId === a.id ? " is-selected" : ""}`}
                      onClick={() => {
                        setAddressId(a.id);
                        setPincode(a.pincode);
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
                  ))}
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

function QuickAddPatientForm({ userId, onAdded }: { userId: string; onAdded: (id: string) => void }) {
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
      <button className="btn btn-primary" type="submit" disabled={busy}>
        Save
      </button>
    </form>
  );
}
