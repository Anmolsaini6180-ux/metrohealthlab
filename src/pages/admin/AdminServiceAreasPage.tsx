import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createServiceArea, getAllServiceAreas, updateServiceArea } from "@/services/adminCatalogService";
import type { ServiceArea } from "@/types/serviceArea";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminServiceAreasPage() {
  const { user } = useAuth();
  const areas = useAsync(getAllServiceAreas, []);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(area: ServiceArea) {
    if (!user) return;
    await updateServiceArea(user.uid, area.id, { active: !area.active });
    areas.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Service areas</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add area"}</button>
      </div>

      {showCreate && user && (
        <ServiceAreaForm actorUid={user.uid} onDone={() => { setShowCreate(false); areas.retry(); }} />
      )}

      {areas.loading && <LoadingState rows={3} />}
      {areas.error && <ErrorState message={areas.error} onRetry={areas.retry} />}
      {areas.data && areas.data.length === 0 && <EmptyState icon="location_on" title="No service areas yet" />}
      {areas.data && areas.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {areas.data.map((a) => (
            <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{a.pincode} — {a.city} {!a.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {a.area ?? ""} • Home collection: {a.homeCollectionAvailable ? "yes" : "no"} • Fee: ₹{a.collectionFee}
                </p>
              </div>
              <button className="btn btn-outline" onClick={() => handleToggleActive(a)}>{a.active ? "Deactivate" : "Activate"}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceAreaForm({ actorUid, onDone }: { actorUid: string; onDone: () => void }) {
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [homeCollectionAvailable, setHomeCollectionAvailable] = useState(true);
  const [collectionFee, setCollectionFee] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createServiceArea(actorUid, { pincode, city, area: area || undefined, homeCollectionAvailable, collectionFee, active: true });
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Pincode" required value={pincode} onChange={(e) => setPincode(e.target.value)} />
      <input placeholder="City" required value={city} onChange={(e) => setCity(e.target.value)} />
      <input placeholder="Area (optional)" value={area} onChange={(e) => setArea(e.target.value)} />
      <label><input type="checkbox" checked={homeCollectionAvailable} onChange={(e) => setHomeCollectionAvailable(e.target.checked)} /> Home collection available</label>
      <input type="number" placeholder="Collection fee" value={collectionFee} onChange={(e) => setCollectionFee(Number(e.target.value))} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Create area"}</button>
    </form>
  );
}
