import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { usePaymentCheckout } from "@/hooks/usePaymentCheckout";
import { getPatients, addPatient } from "@/services/patientService";
import { getAddresses } from "@/services/addressService";
import { checkServiceability } from "@/services/serviceabilityService";
import { subscribeToSlots } from "@/services/slotService";
import { formatCurrencyInr } from "@/services/pricingService";
import { createBooking, getBookingQuote, type GetBookingQuoteResponse } from "@/services/bookingService";
import type { CollectionType } from "@/types/booking";
import type { Slot } from "@/types/slot";
import type { PaymentMethod } from "@/types/payment";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

interface BookingSelection {
  itemType: "test" | "package";
  refId: string;
  name: string;
  labId: string;
  price: number; // display-only, from the catalog page — never sent as truth to the server
}

const STEPS = ["patient", "collection", "schedule", "coupon", "payment", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  patient: "Patient",
  collection: "Collection",
  schedule: "Date & slot",
  coupon: "Coupon",
  payment: "Payment",
  review: "Review",
};

export default function BookingFlowPage() {
  const { user } = useAuth();
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

  const [couponCode, setCouponCode] = useState("");

  // The ONLY figures ever shown as "what you'll pay" — always the
  // server's response from getBookingQuote, never computed here.
  const [quote, setQuote] = useState<GetBookingQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [createdBooking, setCreatedBooking] = useState<{ bookingId: string; finalAmount: number } | null>(null);
  const paymentCheckout = usePaymentCheckout();

  const patients = useAsync(() => (user ? getPatients(user.uid) : Promise.resolve([])), [user?.uid]);
  const addresses = useAsync(() => (user ? getAddresses(user.uid) : Promise.resolve([])), [user?.uid]);

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

  async function fetchQuote(couponCodeToSend?: string) {
    if (!patientId || !pincodeChecked?.available) return;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const q = await getBookingQuote({
        patientId,
        items: [{ itemType: sel.itemType, refId: sel.refId, name: sel.name }],
        labId: sel.labId,
        collectionType,
        addressId: collectionType === "home" ? addressId ?? undefined : undefined,
        pincode,
        couponCode: couponCodeToSend,
      });
      setQuote(q);
    } catch (err) {
      setQuote(null);
      setQuoteError(toUserMessage(err));
    } finally {
      setQuoteLoading(false);
    }
  }

  async function handleCheckPincode() {
    const area = await checkServiceability(pincode);
    if (!area) {
      setPincodeChecked({ areaId: "", collectionFee: 0, available: false });
      return;
    }
    setPincodeChecked({ areaId: area.id, collectionFee: area.collectionFee, available: area.homeCollectionAvailable || collectionType === "center" });
  }

  async function handleApplyCoupon() {
    await fetchQuote(couponCode.trim() || undefined);
  }

  function handleNext() {
    if (step === "collection") {
      // Leaving the step that determines lab/collection type/area — get
      // (or refresh) the authoritative quote before the customer sees a
      // coupon or review screen.
      fetchQuote(couponCode.trim() || undefined);
    }
    setStepIndex((i) => i + 1);
  }

  async function handleConfirm() {
    if (!user || !patientId || !slotId || !pincodeChecked?.available || !quote) return;
    setCreatingBooking(true);
    setBookingError(null);
    try {
      const result = await createBooking({
        patientId,
        items: [{ itemType: sel.itemType, refId: sel.refId, name: sel.name, labId: sel.labId, price: sel.price }],
        labId: sel.labId,
        collectionType,
        addressId: collectionType === "home" ? addressId ?? undefined : undefined,
        pincode,
        date,
        slotId,
        // Only ever send the coupon code the quote actually confirmed as
        // applied — never a code the customer typed but that the quote
        // rejected, even if it's still sitting in the input.
        couponCode: quote.couponApplied ? couponCode.trim() : undefined,
        paymentMethod,
        idempotencyKey,
        quoteId: quote.quoteId,
      });
      setCreatedBooking(result);
      await runPayment(result.bookingId);
    } catch (err) {
      // A price/slot/coupon check that changed between the quote and
      // submission (or any other server-side validation failure) lands
      // here — the booking was never created, so the customer just goes
      // back a step and re-submits; nothing to roll back.
      setBookingError(toUserMessage(err));
    } finally {
      setCreatingBooking(false);
    }
  }

  async function runPayment(bookingId: string) {
    const result = await paymentCheckout.pay(bookingId, paymentMethod, {
      email: user?.email ?? undefined,
      contact: user?.phoneNumber ?? undefined,
    });
    if (result.outcome === "success" || result.outcome === "delayed") {
      // "delayed" means Razorpay's modal closed but the webhook hasn't
      // confirmed yet — the tracking page keeps watching indefinitely
      // and shows the right "waiting" state, so it's still safe to
      // navigate there rather than block on this screen.
      navigate(`/track/${bookingId}`, { replace: true });
    }
    // outcome === "failed": stay here — the retry button below calls
    // runPayment again without ever calling createBooking a second time.
  }

  function handleRetryPayment() {
    if (createdBooking) runPayment(createdBooking.bookingId);
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
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
          Step {stepIndex + 1} of {STEPS.length} — {STEP_LABELS[step]}
        </p>
        <h1 style={{ fontSize: "var(--text-xl)" }}>{sel.name}</h1>
      </div>

      {step === "patient" && (
        <section>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Who is this test for?</h2>
          {patients.loading && <LoadingState rows={2} />}
          {patients.error && <ErrorState message={patients.error} onRetry={patients.retry} />}
          {patients.data && (
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {patients.data.map((p) => (
                <button
                  key={p.id}
                  className={patientId === p.id ? "btn btn-primary" : "card"}
                  style={{ textAlign: "left" }}
                  onClick={() => setPatientId(p.id)}
                >
                  {p.name} • {p.relationship}
                </button>
              ))}
              {!showAddPatient && (
                <button className="btn btn-outline" onClick={() => setShowAddPatient(true)}>
                  + Add a family member
                </button>
              )}
              {showAddPatient && user && (
                <QuickAddPatientForm
                  userId={user.uid}
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
        <section style={{ display: "grid", gap: "var(--space-md)" }}>
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Collection type</h2>
            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
              <button
                className={collectionType === "home" ? "btn btn-primary" : "btn btn-outline"}
                onClick={() => setCollectionType("home")}
              >
                Home collection
              </button>
              <button
                className={collectionType === "center" ? "btn btn-primary" : "btn btn-outline"}
                onClick={() => setCollectionType("center")}
              >
                Center visit
              </button>
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Check serviceability</h2>
            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="Enter pincode"
                style={{ padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)", flex: 1 }}
              />
              <button className="btn btn-outline" onClick={handleCheckPincode}>
                Check
              </button>
            </div>
            {pincodeChecked && !pincodeChecked.available && (
              <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: 6 }}>
                Service not available at this pincode yet.
              </p>
            )}
            {pincodeChecked && pincodeChecked.available && (
              <p style={{ color: "var(--color-success)", fontSize: "var(--text-sm)", marginTop: 6 }}>
                Service available — exact pricing is confirmed on the next step.
              </p>
            )}
          </div>

          {collectionType === "home" && (
            <div>
              <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Address</h2>
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
                <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                  {addresses.data.map((a) => (
                    <button
                      key={a.id}
                      className={addressId === a.id ? "btn btn-primary" : "card"}
                      style={{ textAlign: "left" }}
                      onClick={() => {
                        setAddressId(a.id);
                        setPincode(a.pincode);
                      }}
                    >
                      {a.label}: {a.house}, {a.street}, {a.city} {a.pincode}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {step === "schedule" && (
        <section style={{ display: "grid", gap: "var(--space-md)" }}>
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Date</h2>
            <div style={{ display: "flex", gap: "var(--space-sm)", overflowX: "auto" }}>
              {nextSevenDays.map((d) => (
                <button
                  key={d}
                  className={date === d ? "btn btn-primary" : "btn btn-outline"}
                  onClick={() => {
                    setDate(d);
                    setSlotId(null);
                  }}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Available slots</h2>
            {slots.loading && <LoadingState rows={2} />}
            {slots.error && <ErrorState message={slots.error} onRetry={slots.retry} />}
            {slots.data && slots.data.length === 0 && (
              <EmptyState icon="event_busy" title="No slots available for this date" description="Try another date." />
            )}
            {slots.data && slots.data.length > 0 && (
              <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                {slots.data.map((s) => (
                  <button
                    key={s.id}
                    className={slotId === s.id ? "btn btn-primary" : "btn btn-outline"}
                    onClick={() => setSlotId(s.id)}
                  >
                    {s.startTime}–{s.endTime}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {step === "coupon" && (
        <section>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Have a coupon?</h2>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Enter coupon code"
              style={{ padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)", flex: 1 }}
            />
            <button className="btn btn-outline" onClick={handleApplyCoupon} disabled={quoteLoading}>
              {quoteLoading ? "Checking..." : "Apply"}
            </button>
          </div>
          {quote && couponCode.trim() && quote.couponApplied && (
            <p style={{ color: "var(--color-success)", fontSize: "var(--text-sm)", marginTop: 6 }}>
              Coupon applied — {formatCurrencyInr(quote.discount)} off.
            </p>
          )}
          {quote && couponCode.trim() && !quote.couponApplied && quote.couponMessage && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: 6 }}>{quote.couponMessage}</p>
          )}
        </section>
      )}

      {step === "payment" && (
        <section>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Payment method</h2>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {(["upi", "card", "netbanking", "wallet", "cash_on_collection"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                className={paymentMethod === m ? "btn btn-primary" : "card"}
                style={{ textAlign: "left" }}
                onClick={() => setPaymentMethod(m)}
              >
                {m.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "review" && (
        <section style={{ display: "grid", gap: "var(--space-sm)" }}>
          <h2 style={{ fontSize: "var(--text-lg)" }}>Review & confirm</h2>

          {quoteLoading && <LoadingState label="Getting the latest price..." rows={2} />}
          {quoteError && <ErrorState message={quoteError} onRetry={() => fetchQuote(couponCode.trim() || undefined)} />}

          {quote && (
            <>
              <div className="card" style={{ display: "grid", gap: 4 }}>
                <Row label="Subtotal" value={formatCurrencyInr(quote.subtotal)} />
                <Row label="Collection fee" value={formatCurrencyInr(quote.collectionFee)} />
                <Row label="Discount" value={`- ${formatCurrencyInr(quote.discount)}`} />
                <Row label="Total" value={formatCurrencyInr(quote.finalAmount)} bold />
              </div>
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                This is the price the server will actually charge — not an estimate.
              </p>
            </>
          )}

          {bookingError && <ErrorState message={bookingError} />}

          {!createdBooking && (
            <button className="btn btn-accent" onClick={handleConfirm} disabled={creatingBooking || !quote || quoteLoading}>
              {creatingBooking ? "Confirming..." : "Confirm booking"}
            </button>
          )}

          {createdBooking && paymentCheckout.phase === "opening" && <p className="text-soft">Opening payment...</p>}

          {createdBooking && paymentCheckout.phase === "verifying" && (
            <p className="text-soft">Payment verification in progress...</p>
          )}

          {createdBooking && paymentCheckout.phase === "success" && (
            <p className="text-soft">Payment successful — redirecting...</p>
          )}

          {createdBooking && paymentCheckout.phase === "failed" && (
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              <ErrorState message={paymentCheckout.error ?? "Payment wasn't completed."} />
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                Your booking {createdBooking.bookingId} is saved — it just isn't paid yet.
              </p>
              <button className="btn btn-accent" onClick={handleRetryPayment}>
                Retry payment
              </button>
            </div>
          )}
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          className="btn btn-outline"
          disabled={stepIndex === 0 || !!createdBooking}
          onClick={() => setStepIndex((i) => i - 1)}
        >
          Back
        </button>
        {step !== "review" && (
          <button className="btn btn-primary" disabled={!canGoNext()} onClick={handleNext}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400 }}>
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
