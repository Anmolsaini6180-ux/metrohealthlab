import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createOffer, getAllOffers, updateOffer } from "@/services/adminCatalogService";
import type { Offer } from "@/types/content";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminOffersPage() {
  const { user } = useAuth();
  const offers = useAsync(getAllOffers, []);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(offer: Offer) {
    if (!user) return;
    await updateOffer(user.uid, offer.id, { active: !offer.active });
    offers.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Offers</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add offer"}</button>
      </div>

      {showCreate && user && <OfferForm actorUid={user.uid} onDone={() => { setShowCreate(false); offers.retry(); }} />}
      {editing && user && <OfferForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); offers.retry(); }} />}

      {offers.loading && <LoadingState rows={3} />}
      {offers.error && <ErrorState message={offers.error} onRetry={offers.retry} />}
      {offers.data && offers.data.length === 0 && <EmptyState icon="local_offer" title="No offers yet" />}
      {offers.data && offers.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {offers.data.map((o) => (
            <div key={o.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{o.title} {!o.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{o.subtitle ?? o.description ?? ""}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(o)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(o)}>{o.active ? "Deactivate" : "Activate"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferForm({ actorUid, existing, onDone }: { actorUid: string; existing?: Offer; onDone: () => void }) {
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    subtitle: existing?.subtitle ?? "",
    description: existing?.description ?? "",
    discountType: existing?.discountType ?? "percentage",
    discountValue: existing?.discountValue ?? 0,
    couponCode: existing?.couponCode ?? "",
    startAt: existing?.startAt ?? "",
    endAt: existing?.endAt ?? "",
    displayOrder: existing?.displayOrder ?? 0,
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
        await updateOffer(actorUid, existing.id, form as Partial<Offer>);
      } else {
        await createOffer(actorUid, { ...form, discountType: form.discountType as "flat" | "percentage", active: true });
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
      <input placeholder="Title" required value={form.title} onChange={(e) => update("title", e.target.value)} />
      <input placeholder="Subtitle" value={form.subtitle} onChange={(e) => update("subtitle", e.target.value)} />
      <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <select value={form.discountType} onChange={(e) => update("discountType", e.target.value as "flat" | "percentage")} style={{ flex: 1 }}>
          <option value="percentage">Percentage off</option>
          <option value="flat">Flat amount off</option>
        </select>
        <input type="number" placeholder="Discount value" value={form.discountValue} onChange={(e) => update("discountValue", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <input placeholder="Coupon code (optional)" value={form.couponCode} onChange={(e) => update("couponCode", e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="date" value={form.startAt} onChange={(e) => update("startAt", e.target.value)} style={{ flex: 1 }} />
        <input type="date" value={form.endAt} onChange={(e) => update("endAt", e.target.value)} style={{ flex: 1 }} />
      </div>
      <input type="number" placeholder="Display order" value={form.displayOrder} onChange={(e) => update("displayOrder", Number(e.target.value))} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : existing ? "Save changes" : "Create offer"}</button>
    </form>
  );
}
