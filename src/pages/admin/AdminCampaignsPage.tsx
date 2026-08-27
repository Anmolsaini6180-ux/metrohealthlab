import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createCampaign, getAllCampaigns, updateCampaign } from "@/services/adminMarketingService";
import { getAllOffers, getAllCoupons } from "@/services/adminCatalogService";
import type { Campaign, CampaignStatus } from "@/types/marketing";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminCampaignsPage() {
  const { user } = useAuth();
  const campaigns = useAsync(getAllCampaigns, []);
  const offers = useAsync(getAllOffers, []);
  const coupons = useAsync(getAllCoupons, []);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  async function handleStatusChange(campaign: Campaign, status: CampaignStatus) {
    if (!user) return;
    await updateCampaign(user.uid, campaign.id, { status });
    campaigns.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Campaigns</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add campaign"}</button>
      </div>

      {showCreate && user && (
        <CampaignForm actorUid={user.uid} offers={offers.data ?? []} coupons={coupons.data ?? []} onDone={() => { setShowCreate(false); campaigns.retry(); }} />
      )}
      {editing && user && (
        <CampaignForm actorUid={user.uid} existing={editing} offers={offers.data ?? []} coupons={coupons.data ?? []} onDone={() => { setEditing(null); campaigns.retry(); }} />
      )}

      {campaigns.loading && <LoadingState rows={3} />}
      {campaigns.error && <ErrorState message={campaigns.error} onRetry={campaigns.retry} />}
      {campaigns.data && campaigns.data.length === 0 && <EmptyState icon="campaign" title="No campaigns yet" />}
      {campaigns.data && campaigns.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {campaigns.data.map((c) => (
            <div key={c.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{c.name}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{c.type} • {c.startAt} → {c.endAt}</p>
                </div>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{c.status}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
                <button className="btn btn-outline" onClick={() => setEditing(c)}>Edit</button>
                {c.status !== "RUNNING" && c.status !== "COMPLETED" && (
                  <button className="btn btn-outline" onClick={() => handleStatusChange(c, "RUNNING")}>Resume / Start</button>
                )}
                {c.status === "RUNNING" && (
                  <button className="btn btn-outline" onClick={() => handleStatusChange(c, "PAUSED")}>Pause</button>
                )}
                {c.status !== "COMPLETED" && (
                  <button className="btn btn-outline" onClick={() => handleStatusChange(c, "COMPLETED")}>Archive (Complete)</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignForm({
  actorUid,
  existing,
  offers,
  coupons,
  onDone,
}: {
  actorUid: string;
  existing?: Campaign;
  offers: { id: string; title: string }[];
  coupons: { id: string; code: string }[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    type: existing?.type ?? "seasonal",
    startAt: existing?.startAt ?? "",
    endAt: existing?.endAt ?? "",
    offerId: existing?.offerId ?? "",
    couponId: existing?.couponId ?? "",
  });
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
      const payload = {
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        startAt: form.startAt,
        endAt: form.endAt,
        offerId: form.offerId || undefined,
        couponId: form.couponId || undefined,
      };
      if (existing) {
        await updateCampaign(actorUid, existing.id, payload);
      } else {
        await createCampaign(actorUid, { ...payload, status: "DRAFT" });
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
      <input placeholder="Campaign name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
      <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
      <input placeholder="Type (e.g. seasonal, referral)" value={form.type} onChange={(e) => update("type", e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="date" required value={form.startAt} onChange={(e) => update("startAt", e.target.value)} style={{ flex: 1 }} />
        <input type="date" required value={form.endAt} onChange={(e) => update("endAt", e.target.value)} style={{ flex: 1 }} />
      </div>
      <select value={form.offerId} onChange={(e) => update("offerId", e.target.value)}>
        <option value="">Link an offer (optional)</option>
        {offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
      <select value={form.couponId} onChange={(e) => update("couponId", e.target.value)}>
        <option value="">Link a coupon (optional)</option>
        {coupons.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
      </select>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : existing ? "Save changes" : "Create campaign (draft)"}</button>
    </form>
  );
}
