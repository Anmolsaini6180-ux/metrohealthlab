import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createLab, getAllLabs, updateLab } from "@/services/adminCatalogService";
import type { Lab } from "@/types/lab";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminLabsPage() {
  const { user } = useAuth();
  const labs = useAsync(getAllLabs, []);
  const [editing, setEditing] = useState<Lab | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(lab: Lab) {
    if (!user) return;
    await updateLab(user.uid, lab.id, { active: !lab.active });
    labs.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Labs</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Cancel" : "+ Add lab"}
        </button>
      </div>

      {showCreate && user && (
        <LabForm actorUid={user.uid} onDone={() => { setShowCreate(false); labs.retry(); }} />
      )}
      {editing && user && (
        <LabForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); labs.retry(); }} />
      )}

      {labs.loading && <LoadingState rows={3} />}
      {labs.error && <ErrorState message={labs.error} onRetry={labs.retry} />}
      {labs.data && labs.data.length === 0 && <EmptyState icon="storefront" title="No labs yet" />}
      {labs.data && labs.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {labs.data.map((l) => (
            <div key={l.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>
                  {l.name} {!l.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{l.address ?? "No address set"}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(l)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(l)}>
                  {l.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabForm({ actorUid, existing, onDone }: { actorUid: string; existing?: Lab; onDone: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    address: existing?.address ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    serviceAreas: existing?.serviceAreas.join(", ") ?? "",
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
      const serviceAreas = form.serviceAreas.split(",").map((s) => s.trim()).filter(Boolean);
      if (existing) {
        await updateLab(actorUid, existing.id, { ...form, serviceAreas });
      } else {
        await createLab(actorUid, { ...form, serviceAreas, testIds: [], packageIds: [], active: true });
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
      <input placeholder="Name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
      <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
      <input placeholder="Address" value={form.address} onChange={(e) => update("address", e.target.value)} />
      <input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
      <input type="email" placeholder="Email" value={form.email} onChange={(e) => update("email", e.target.value)} />
      <input placeholder="Service area IDs (comma-separated)" value={form.serviceAreas} onChange={(e) => update("serviceAreas", e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : existing ? "Save changes" : "Create lab"}
      </button>
    </form>
  );
}
