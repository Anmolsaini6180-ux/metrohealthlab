import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createCoupon, getAllCoupons, updateCoupon } from "@/services/adminCatalogService";
import type { Coupon } from "@/types/coupon";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminCouponsPage() {
  const { user } = useAuth();
  const coupons = useAsync(getAllCoupons, []);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(coupon: Coupon) {
    if (!user) return;
    await updateCoupon(user.uid, coupon.id, { active: !coupon.active });
    coupons.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Coupons</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add coupon"}</button>
      </div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        Actual eligibility and redemption still only ever happen server-side (getBookingQuote /
        createBooking) — this screen only manages the coupon's configuration.
      </p>

      {showCreate && user && <CouponForm actorUid={user.uid} onDone={() => { setShowCreate(false); coupons.retry(); }} />}
      {editing && user && <CouponForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); coupons.retry(); }} />}

      {coupons.loading && <LoadingState rows={3} />}
      {coupons.error && <ErrorState message={coupons.error} onRetry={coupons.retry} />}
      {coupons.data && coupons.data.length === 0 && <EmptyState icon="sell" title="No coupons yet" />}
      {coupons.data && coupons.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {coupons.data.map((c) => (
            <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{c.code} {!c.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {c.discountType === "flat" ? `₹${c.discountValue} off` : `${c.discountValue}% off`} • used {c.usedCount ?? 0}{c.usageLimit ? ` / ${c.usageLimit}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(c)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(c)}>{c.active ? "Deactivate" : "Activate"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CouponForm({ actorUid, existing, onDone }: { actorUid: string; existing?: Coupon; onDone: () => void }) {
  const [form, setForm] = useState({
    code: existing?.code ?? "",
    discountType: existing?.discountType ?? "percentage",
    discountValue: existing?.discountValue ?? 0,
    minimumOrder: existing?.minimumOrder ?? 0,
    maximumDiscount: existing?.maximumDiscount ?? 0,
    usageLimit: existing?.usageLimit ?? 0,
    perUserLimit: existing?.perUserLimit ?? 1,
    startDate: existing?.startDate ?? "",
    expiryDate: existing?.expiryDate ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateCoupon(actorUid, existing.id, form as Partial<Coupon>);
      } else {
        await createCoupon(actorUid, {
          ...form,
          discountType: form.discountType as "flat" | "percentage",
          usedCount: 0,
          active: true,
        });
      }
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Code (e.g. WELCOME50)" required value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <select value={form.discountType} onChange={(e) => update("discountType", e.target.value as "flat" | "percentage")} style={{ flex: 1 }}>
          <option value="percentage">Percentage off</option>
          <option value="flat">Flat amount off</option>
        </select>
        <input type="number" placeholder="Value" required value={form.discountValue} onChange={(e) => update("discountValue", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="number" placeholder="Minimum order" value={form.minimumOrder} onChange={(e) => update("minimumOrder", Number(e.target.value))} style={{ flex: 1 }} />
        <input type="number" placeholder="Maximum discount" value={form.maximumDiscount} onChange={(e) => update("maximumDiscount", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="number" placeholder="Usage limit (global)" value={form.usageLimit} onChange={(e) => update("usageLimit", Number(e.target.value))} style={{ flex: 1 }} />
        <input type="number" placeholder="Per-user limit" value={form.perUserLimit} onChange={(e) => update("perUserLimit", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="date" required value={form.startDate} onChange={(e) => update("startDate", e.target.value)} style={{ flex: 1 }} />
        <input type="date" required value={form.expiryDate} onChange={(e) => update("expiryDate", e.target.value)} style={{ flex: 1 }} />
      </div>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : existing ? "Save changes" : "Create coupon"}</button>
    </form>
  );
}
