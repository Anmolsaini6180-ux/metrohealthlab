import { useEffect, useMemo, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import {
  getAllLabs,
  getAllPackages,
  getAllServiceAreas,
  getAllTests,
  getLabPricingForItem,
} from "@/services/adminCatalogService";
import { createStaffBooking } from "@/services/adminBookingWriteService";
import { formatCurrencyInr } from "@/services/pricingService";
import { parseWhatsAppBooking, type ParsedWhatsAppBooking } from "@/utils/whatsappBooking";
import { cashStateFor, clampReceived } from "@/utils/cashState";
import { logOperationError, toUserMessage } from "@/utils/errors";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import type { LabPricing } from "@/types/lab";

type Mode = "choose" | "admin" | "whatsapp";

interface FormState {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  pincode: string;
  serviceAreaId: string;
  itemKind: "package" | "test";
  itemId: string;
  pricingRefId: string;
  date: string;
  slot: string;
  notes: string;
  amountReceived: string;
}

const EMPTY_FORM: FormState = {
  customerName: "",
  phone: "",
  email: "",
  address: "",
  pincode: "",
  serviceAreaId: "",
  itemKind: "package",
  itemId: "",
  pricingRefId: "",
  date: new Date().toISOString().slice(0, 10),
  slot: "",
  notes: "",
  amountReceived: "0",
};

// Staff-entered bookings: a phone call, a walk-in, or a pasted WhatsApp
// message.
//
// Price and collection fee are never typed in. The lab price comes from
// the labPricing row the admin selects and the fee from the chosen
// service area, both loaded from Firestore — so a staff booking is
// priced from the same catalogue a website booking is, and the total is
// derived rather than asserted.
export default function AddBookingDialog({
  actorUid,
  onClose,
  onCreated,
}: {
  actorUid: string;
  onClose: () => void;
  onCreated: (bookingId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pasted, setPasted] = useState("");
  const [parseReport, setParseReport] = useState<{
    matched: string[];
    missing: string[];
    unrecognised: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packages = useAsync(getAllPackages, []);
  const tests = useAsync(getAllTests, []);
  const labs = useAsync(getAllLabs, []);
  const areas = useAsync(getAllServiceAreas, []);

  const labNameById = useMemo(
    () => new Map((labs.data ?? []).map((l) => [l.id, l.name])),
    [labs.data]
  );

  // Lab prices for whichever catalogue item is selected.
  const [pricing, setPricing] = useState<LabPricing[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  useEffect(() => {
    if (!form.itemId) {
      setPricing([]);
      return;
    }
    let cancelled = false;
    setPricingLoading(true);
    getLabPricingForItem(form.itemKind, form.itemId)
      .then((rows) => {
        if (!cancelled) setPricing(rows);
      })
      .catch((err) => {
        logOperationError("getLabPricingForItem", err, { itemId: form.itemId });
        if (!cancelled) setPricing([]);
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.itemKind, form.itemId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedPricing = pricing.find((p) => p.id === form.pricingRefId) ?? null;
  const selectedArea = (areas.data ?? []).find((a) => a.id === form.serviceAreaId) ?? null;
  const itemName =
    form.itemKind === "package"
      ? (packages.data ?? []).find((p) => p.id === form.itemId)?.name
      : (tests.data ?? []).find((t) => t.id === form.itemId)?.name;

  const price = selectedPricing?.price ?? 0;
  const collectionFee = selectedArea?.collectionFee ?? 0;
  const finalAmount = price + collectionFee;
  const received = clampReceived(finalAmount, Number(form.amountReceived));
  const cash = cashStateFor(finalAmount, received);

  // Everything that must be present before a booking can be written.
  const missing: string[] = [];
  if (!form.customerName.trim()) missing.push("customer name");
  if (!form.phone.trim()) missing.push("phone");
  if (!form.itemId) missing.push("package or test");
  if (!form.pricingRefId) missing.push("lab");
  if (!form.serviceAreaId) missing.push("service area");
  if (!form.date) missing.push("booking date");
  const canSubmit = missing.length === 0 && !busy;

  function handleParse() {
    const result = parseWhatsAppBooking(pasted);
    const f: ParsedWhatsAppBooking = result.fields;

    // Only fields that map unambiguously onto the form are filled in.
    // Package, lab and service area are deliberately NOT guessed from
    // free text — they must be picked from the catalogue below, so the
    // booking is priced from real data rather than from a message.
    setForm((prev) => ({
      ...prev,
      customerName: f.customerName ?? prev.customerName,
      phone: f.customerPhone ?? prev.phone,
      address: f.customerAddress ?? prev.address,
      slot: f.slot ?? prev.slot,
      amountReceived: f.paidAmount !== undefined ? String(f.paidAmount) : prev.amountReceived,
    }));

    const stillNeeded: string[] = [];
    if (!f.customerName) stillNeeded.push("customer name");
    if (!f.customerPhone) stillNeeded.push("phone");
    stillNeeded.push("package/test, lab and service area (always chosen from the catalogue)");

    setParseReport({
      matched: result.matched,
      missing: stillNeeded,
      unrecognised: result.unrecognisedLines,
    });
  }

  async function handleSubmit() {
    if (!canSubmit || !selectedPricing || !selectedArea) return;
    setBusy(true);
    setError(null);
    try {
      const { bookingId } = await createStaffBooking(actorUid, {
        item: {
          itemType: form.itemKind,
          refId: form.itemId,
          name: itemName ?? "",
          labId: selectedPricing.labId,
          price,
        },
        labId: selectedPricing.labId,
        labName: labNameById.get(selectedPricing.labId),
        collectionType: "home",
        pincode: selectedArea.pincode,
        date: form.date,
        slotId: form.slot || undefined,
        finalAmount,
        amountReceived: received,
        source: mode === "whatsapp" ? "whatsapp" : "admin",
        contact: {
          name: form.customerName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          email: form.email.trim() || undefined,
        },
        notes: form.notes.trim() || undefined,
      });
      onCreated(bookingId);
    } catch (err) {
      logOperationError("createStaffBooking", err, { source: mode });
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const catalogueLoading = packages.loading || tests.loading || areas.loading;

  return (
    <div className="mh-icon-picker" role="dialog" aria-modal="true" aria-label="Add booking" onClick={onClose}>
      <div className="mh-icon-picker__panel card mh-dialog-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="mh-icon-picker__head">
          <p style={{ fontWeight: 700 }}>
            {mode === "choose" ? "Add booking" : mode === "admin" ? "Admin booking" : "WhatsApp booking"}
          </p>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <span className="mi">close</span>
          </button>
        </div>

        {mode === "choose" && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <button className="card" style={{ textAlign: "left" }} onClick={() => setMode("admin")}>
              <p style={{ fontWeight: 700 }}>🛠️ Create Admin Booking</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                Enter a booking taken by phone or in person.
              </p>
            </button>
            <button className="card" style={{ textAlign: "left" }} onClick={() => setMode("whatsapp")}>
              <p style={{ fontWeight: 700 }}>💬 Add WhatsApp Booking</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                Paste a WhatsApp booking message, review what was read, then confirm.
              </p>
            </button>
          </div>
        )}

        {mode === "whatsapp" && (
          <div style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
            <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
              Paste the WhatsApp booking message
              <textarea
                rows={6}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"Booking Confirmation\nCustomer Name: ...\nCustomer Phone: ...\nBooking Amount: ..."}
              />
            </label>
            <button className="btn btn-outline" type="button" onClick={handleParse} disabled={!pasted.trim()}>
              Parse message
            </button>

            {parseReport && (
              <div className="card" style={{ display: "grid", gap: 4, borderColor: "var(--color-amber)" }}>
                <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                  Read {parseReport.matched.length} field{parseReport.matched.length === 1 ? "" : "s"} — check every value below
                </p>
                {parseReport.missing.length > 0 && (
                  <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                    Still needed: {parseReport.missing.join("; ")}
                  </p>
                )}
                {parseReport.unrecognised.length > 0 && (
                  <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                    Not understood ({parseReport.unrecognised.length} line
                    {parseReport.unrecognised.length === 1 ? "" : "s"}): {parseReport.unrecognised.slice(0, 3).join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {(mode === "admin" || mode === "whatsapp") && (
          <>
            {catalogueLoading && <LoadingState rows={3} label="Loading catalogue..." />}
            {packages.error && <ErrorState message={packages.error} onRetry={packages.retry} />}
            {areas.error && <ErrorState message={areas.error} onRetry={areas.retry} />}

            {!catalogueLoading && (
              <div className="mh-form-grid" style={{ marginBottom: 0 }}>
                <label>
                  Customer name
                  <input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} />
                </label>
                <label>
                  Phone
                  <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </label>
                <label>
                  Email <span className="text-soft">(optional)</span>
                  <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </label>
                <label>
                  Booking date
                  <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Address <span className="text-soft">(optional)</span>
                  <input value={form.address} onChange={(e) => update("address", e.target.value)} />
                </label>

                <label>
                  Service area
                  <select value={form.serviceAreaId} onChange={(e) => update("serviceAreaId", e.target.value)}>
                    <option value="">Select an area</option>
                    {(areas.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.pincode} — {a.area ?? a.city} (fee {formatCurrencyInr(a.collectionFee ?? 0)})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Booking for
                  <select
                    value={form.itemKind}
                    onChange={(e) => {
                      update("itemKind", e.target.value as "package" | "test");
                      update("itemId", "");
                      update("pricingRefId", "");
                    }}
                  >
                    <option value="package">Package</option>
                    <option value="test">Test</option>
                  </select>
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  {form.itemKind === "package" ? "Package" : "Test"}
                  <select
                    value={form.itemId}
                    onChange={(e) => {
                      update("itemId", e.target.value);
                      update("pricingRefId", "");
                    }}
                  >
                    <option value="">Select {form.itemKind}</option>
                    {(form.itemKind === "package" ? packages.data ?? [] : tests.data ?? []).map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Lab &amp; price
                  <select
                    value={form.pricingRefId}
                    onChange={(e) => update("pricingRefId", e.target.value)}
                    disabled={!form.itemId || pricingLoading}
                  >
                    <option value="">
                      {!form.itemId
                        ? "Select an item first"
                        : pricingLoading
                          ? "Loading lab prices..."
                          : pricing.length === 0
                            ? "No lab offers this item"
                            : "Select a lab"}
                    </option>
                    {pricing.map((p) => (
                      <option key={p.id} value={p.id}>
                        {labNameById.get(p.labId) ?? "Partner lab"} — {formatCurrencyInr(p.price)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Preferred slot <span className="text-soft">(optional)</span>
                  <input value={form.slot} onChange={(e) => update("slot", e.target.value)} placeholder="07:00-09:00" />
                </label>

                <label>
                  Cash received now
                  <input
                    type="number"
                    min={0}
                    max={finalAmount}
                    value={form.amountReceived}
                    onChange={(e) => update("amountReceived", e.target.value)}
                  />
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Notes <span className="text-soft">(optional)</span>
                  <textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
                </label>
              </div>
            )}

            {/* Derived, never typed: price comes from the selected lab
                pricing row and the fee from the selected service area. */}
            {!catalogueLoading && (
              <div className="card" style={{ display: "grid", gap: 2, marginTop: "var(--space-sm)" }}>
                <Row label="Item price" value={formatCurrencyInr(price)} />
                <Row label="Collection fee" value={formatCurrencyInr(collectionFee)} />
                <Row label="Final amount" value={formatCurrencyInr(finalAmount)} bold />
                <Row label="Payment method" value="Cash on Home" />
                <Row label="Amount received" value={formatCurrencyInr(cash.amountReceived)} />
                <Row label="Pending amount" value={formatCurrencyInr(cash.pendingAmount)} />
                <Row label="Payment status" value={cash.paymentStatus.replace(/_/g, " ")} />
                <Row label="Source" value={mode === "whatsapp" ? "WhatsApp / Manual" : "Admin"} />
              </div>
            )}

            {missing.length > 0 && !catalogueLoading && (
              <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
                Still required: {missing.join(", ")}
              </p>
            )}

            {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}

            <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                {busy ? "Creating..." : "Create booking"}
              </button>
              <button className="btn btn-outline" onClick={() => setMode("choose")} disabled={busy}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <p style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", fontWeight: bold ? 700 : 400 }}>
      <span className="text-soft">{label}</span>
      <span>{value}</span>
    </p>
  );
}
