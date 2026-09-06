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
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import {
  buildWhatsAppBookingMessage,
  buildWhatsAppLink,
  parseWhatsAppBooking,
  type ParsedWhatsAppBooking,
} from "@/utils/whatsappBooking";
import { cashStateFor, clampReceived } from "@/utils/cashState";
import { logOperationError, toUserMessage } from "@/utils/errors";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import type { LabPricing } from "@/types/lab";

type Mode = "choose" | "admin" | "whatsapp";

interface FormState {
  customerName: string;
  customerAge: string;
  customerGender: string;
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
  /** True for a test/package fulfilled externally (an affiliate/aggregator booking) rather than priced from our own catalogue+lab pricing — see the "Custom item" section's own comment. */
  useCustomItem: boolean;
  customItemName: string;
  customAmount: string;
}

const EMPTY_FORM: FormState = {
  customerName: "",
  customerAge: "",
  customerGender: "",
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
  useCustomItem: false,
  customItemName: "",
  customAmount: "",
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
  onCreated: (reference: string) => void;
}) {
  const { settings } = useBrandingSettings();
  const [mode, setMode] = useState<Mode>("choose");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [created, setCreated] = useState<{ reference: string; finalAmount: number; amountReceived: number; itemName: string } | null>(null);
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

  // A custom item's price IS the final amount directly — an
  // affiliate's quoted "Booking Amount" is already the whole booking's
  // value, not a per-item price our own collection-fee logic should
  // add on top of.
  const price = form.useCustomItem ? Number(form.customAmount) || 0 : (selectedPricing?.price ?? 0);
  const collectionFee = form.useCustomItem ? 0 : (selectedArea?.collectionFee ?? 0);
  const finalAmount = price + collectionFee;
  const received = clampReceived(finalAmount, Number(form.amountReceived));
  const cash = cashStateFor(finalAmount, received);

  // Everything that must be present before a booking can be written.
  // A custom item skips the catalogue/lab/service-area requirements —
  // both lab_id columns are nullable specifically for this case (see
  // StaffBookingInput's own comment), and create_staff_booking never
  // validates pincode against service_areas at all.
  const missing: string[] = [];
  if (!form.customerName.trim()) missing.push("customer name");
  if (!form.phone.trim()) missing.push("phone");
  if (!form.date) missing.push("booking date");
  if (form.useCustomItem) {
    if (!form.customItemName.trim()) missing.push("test/package name");
    if (!form.customAmount || Number(form.customAmount) <= 0) missing.push("booking amount");
  } else {
    if (!form.itemId) missing.push("package or test");
    if (!form.pricingRefId) missing.push("lab");
    if (!form.serviceAreaId) missing.push("service area");
  }
  const canSubmit = missing.length === 0 && !busy;

  function handleParse() {
    const result = parseWhatsAppBooking(pasted);
    const f: ParsedWhatsAppBooking = result.fields;

    // A pincode buried in the address line, if any — service area
    // matching is skipped entirely for a custom item (see the "Custom
    // item" section's own comment), so this is only ever used to show
    // it back for reference, never to look anything up.
    const pincodeMatch = f.customerAddress?.match(/\b\d{6}\b/);

    // Provenance from the affiliate's own message, since neither has a
    // column of its own to live in — recorded, never silently dropped.
    const provenance = [
      f.bookingRef ? `Affiliate booking ref: ${f.bookingRef}` : null,
      f.affiliateName ? `Affiliate: ${f.affiliateName}` : null,
      f.bookingStatus ? `Affiliate status at booking time: ${f.bookingStatus}` : null,
    ]
      .filter((line): line is string => !!line)
      .join("\n");

    setForm((prev) => ({
      ...prev,
      customerName: f.customerName ?? prev.customerName,
      customerAge: f.customerAge !== undefined ? String(f.customerAge) : prev.customerAge,
      customerGender: f.customerGender ?? prev.customerGender,
      phone: f.customerPhone ?? prev.phone,
      address: f.customerAddress ?? prev.address,
      pincode: pincodeMatch?.[0] ?? prev.pincode,
      date: f.slotDate ?? prev.date,
      slot: f.slotTime ?? f.slot ?? prev.slot,
      amountReceived: f.paidAmount !== undefined ? String(f.paidAmount) : prev.amountReceived,
      // A test/package name from an affiliate's own message essentially
      // never matches our catalogue's own naming exactly — default to
      // the custom-item path so every field the message actually gave
      // us fills in immediately. The toggle below still lets an admin
      // switch back to a real catalogue item if they recognise one.
      useCustomItem: f.testDetails !== undefined ? true : prev.useCustomItem,
      customItemName: f.testDetails ?? prev.customItemName,
      customAmount: f.bookingAmount !== undefined ? String(f.bookingAmount) : prev.customAmount,
      notes: provenance ? [prev.notes, provenance].filter(Boolean).join("\n") : prev.notes,
    }));

    const stillNeeded: string[] = [];
    if (!f.customerName) stillNeeded.push("customer name");
    if (!f.customerPhone) stillNeeded.push("phone");
    if (f.testDetails === undefined) stillNeeded.push("test/package name");
    if (f.bookingAmount === undefined) stillNeeded.push("booking amount");
    stillNeeded.push("cash actually received (never read from the message) and status");

    setParseReport({
      matched: result.matched,
      missing: stillNeeded,
      unrecognised: result.unrecognisedLines,
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!form.useCustomItem && (!selectedPricing || !selectedArea)) return;
    setBusy(true);
    setError(null);
    try {
      // form.slot is a free-text preferred time ("11:30:00",
      // "07:00-09:00") — it is NOT a real slots.id, and
      // create_staff_booking's p_slot_id genuinely looks one up
      // (raising "That slot is no longer available" for anything
      // else), so it is folded into notes as a note instead of ever
      // being sent as slotId.
      const notesWithSlot = [
        form.slot.trim() ? `Preferred time: ${form.slot.trim()}` : null,
        form.customerAge.trim() || form.customerGender.trim()
          ? `Age/Gender: ${[form.customerAge.trim(), form.customerGender.trim()].filter(Boolean).join("/")}`
          : null,
        form.notes.trim() || null,
      ]
        .filter((line): line is string => !!line)
        .join("\n");

      const { reference } = await createStaffBooking(actorUid, {
        item: form.useCustomItem
          ? {
              itemType: "test",
              // Stable but synthetic — booking_items.ref_id has no
              // foreign key (it holds either a real package or test id
              // depending on item_type, application-enforced not DB-
              // enforced), so create_staff_booking's own TP lookup by
              // this id simply finds nothing for an external item —
              // TP stays honestly null rather than a guessed value.
              refId: `external-${crypto.randomUUID()}`,
              name: form.customItemName.trim(),
              labId: "",
              price,
            }
          : {
              itemType: form.itemKind,
              refId: form.itemId,
              name: itemName ?? "",
              labId: selectedPricing!.labId,
              price,
            },
        labId: form.useCustomItem ? undefined : selectedPricing!.labId,
        labName: form.useCustomItem ? undefined : labNameById.get(selectedPricing!.labId),
        collectionType: "home",
        pincode: form.useCustomItem ? form.pincode.trim() || undefined : selectedArea!.pincode,
        date: form.date,
        finalAmount,
        amountReceived: received,
        source: mode === "whatsapp" ? "whatsapp" : "admin",
        contact: {
          name: form.customerName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          email: form.email.trim() || undefined,
        },
        notes: notesWithSlot || undefined,
      });
      // onCreated (closes the dialog + toasts) fires only once the
      // admin dismisses the success panel below — not immediately —
      // so there's a real chance to send the WhatsApp confirmation
      // first, rather than the dialog vanishing out from under them.
      setCreated({ reference, finalAmount, amountReceived: received, itemName: form.useCustomItem ? form.customItemName.trim() : itemName ?? "" });
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

        {created && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div className="card" style={{ borderColor: "var(--color-success)" }}>
              <p style={{ fontWeight: 700 }}>
                <span className="mi" aria-hidden="true" style={{ verticalAlign: "middle", color: "var(--color-success)" }}>check_circle</span> Booking {created.reference} created
              </p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                {created.itemName} — {formatCurrencyInr(created.finalAmount)}
              </p>
            </div>
            {(() => {
              const link = buildWhatsAppLink(
                form.phone,
                buildWhatsAppBookingMessage(
                  {
                    id: created.reference,
                    items: [{ itemType: form.useCustomItem ? "test" : form.itemKind, refId: "", name: created.itemName, labId: "", price: created.finalAmount }],
                    finalAmount: created.finalAmount,
                    amountReceived: created.amountReceived,
                    bookingStatus: "confirmed",
                    date: form.date,
                    contact: {
                      name: form.customerName.trim(),
                      phone: form.phone.trim(),
                      address: form.address.trim() || undefined,
                    },
                    labName: form.useCustomItem ? undefined : labNameById.get(selectedPricing?.labId ?? ""),
                  },
                  settings?.businessName ?? "Metro Health Lab"
                )
              );
              return link ? (
                <a className="btn btn-primary" href={link} target="_blank" rel="noreferrer">
                  <span className="mi" aria-hidden="true">chat</span> Send confirmation on WhatsApp
                </a>
              ) : (
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>No valid phone number to message.</p>
              );
            })()}
            <button
              className="btn btn-outline"
              onClick={() => {
                onCreated(created.reference);
              }}
            >
              Done
            </button>
          </div>
        )}

        {!created && mode === "choose" && (
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

        {!created && mode === "whatsapp" && (
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

        {!created && (mode === "admin" || mode === "whatsapp") && (
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
                  Age <span className="text-soft">(optional, kept as a note)</span>
                  <input value={form.customerAge} onChange={(e) => update("customerAge", e.target.value)} style={{ maxWidth: 100 }} />
                </label>
                <label>
                  Gender <span className="text-soft">(optional, kept as a note)</span>
                  <select value={form.customerGender} onChange={(e) => update("customerGender", e.target.value)}>
                    <option value="">—</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
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

                {!form.useCustomItem && (
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
                )}

                <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, flexDirection: "row" }}>
                  <input type="checkbox" checked={form.useCustomItem} onChange={(e) => update("useCustomItem", e.target.checked)} style={{ width: "auto" }} />
                  <span>This test/package is fulfilled externally — not in our catalogue (type its name and amount directly)</span>
                </label>

                {form.useCustomItem ? (
                  <>
                    <label style={{ gridColumn: "1 / -1" }}>
                      Test/package name
                      <input value={form.customItemName} onChange={(e) => update("customItemName", e.target.value)} placeholder="e.g. Urine Routine & Microscopy Extended" />
                    </label>
                    <label>
                      Booking amount (₹)
                      <input type="number" min="0" step="0.01" value={form.customAmount} onChange={(e) => update("customAmount", e.target.value)} />
                    </label>
                    <label>
                      Pincode <span className="text-soft">(optional, reference only)</span>
                      <input value={form.pincode} onChange={(e) => update("pincode", e.target.value)} />
                    </label>
                  </>
                ) : (
                  <>
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
                  </>
                )}

                <label>
                  Preferred time <span className="text-soft">(optional — a note only, not a real slot booking)</span>
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
