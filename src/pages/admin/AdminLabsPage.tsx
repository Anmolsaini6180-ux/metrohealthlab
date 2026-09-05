import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createLab, getAllLabs, getAllServiceAreas, updateLab } from "@/services/adminCatalogService";
import type { Lab } from "@/types/lab";
import type { ServiceArea } from "@/types/serviceArea";
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
    serviceAreas: existing?.serviceAreas ?? ([] as string[]),
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
        await updateLab(actorUid, existing.id, form);
      } else {
        await createLab(actorUid, { ...form, testIds: [], packageIds: [], active: true });
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
      <ServiceAreaPicker selectedIds={form.serviceAreas} onChange={(serviceAreas) => update("serviceAreas", serviceAreas)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : existing ? "Save changes" : "Create lab"}
      </button>
    </form>
  );
}

/**
 * Search-and-pick service-area selector — replaces what used to be a
 * raw "type comma-separated service area IDs" text box, unusable for
 * the same reason AdminPackagesPage's old test-id field was: an admin
 * has no way to know a service area's internal id by sight. Picks by
 * real pincode/city instead, through the exact same serviceAreas:
 * string[] path createLab/updateLab already had.
 */
function ServiceAreaPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const areas = useAsync(getAllServiceAreas, []);
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map((areas.data ?? []).map((a) => [a.id, a])), [areas.data]);
  const selectedAreas = selectedIds.map((id) => byId.get(id)).filter((a): a is ServiceArea => !!a);

  function areaLabel(a: ServiceArea): string {
    return `${a.pincode} — ${a.area ? `${a.area}, ` : ""}${a.city}`;
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = areas.data ?? [];
    const unselected = pool.filter((a) => !selectedIds.includes(a.id));
    if (!q) return unselected.slice(0, 20);
    return unselected.filter((a) => areaLabel(a).toLowerCase().includes(q)).slice(0, 20);
  }, [areas.data, search, selectedIds]);

  function addArea(id: string) {
    onChange([...selectedIds, id]);
    setSearch("");
  }

  function removeArea(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
        Service areas {selectedIds.length > 0 && <span className="text-soft">({selectedIds.length})</span>}
      </span>

      {selectedAreas.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedAreas.map((a) => (
            <span key={a.id} className="mh-removable-chip">
              {areaLabel(a)}
              <button type="button" aria-label={`Remove ${areaLabel(a)}`} onClick={() => removeArea(a.id)}>
                <span className="mi" aria-hidden="true">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
      {selectedIds.length > selectedAreas.length && (
        <p style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>
          {selectedIds.length - selectedAreas.length} linked service area(s) no longer exist and will be dropped on
          save.
        </p>
      )}

      {areas.loading && <LoadingState rows={1} />}
      {areas.error && <ErrorState message={areas.error} onRetry={areas.retry} />}

      {areas.data && (
        <>
          <input
            type="search"
            placeholder="Search by pincode, area or city to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(search.trim() || results.length > 0) && (
            <div className="card" style={{ maxHeight: 200, overflowY: "auto", display: "grid", gap: 4 }}>
              {results.length === 0 && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No service areas match.</p>}
              {results.map((a) => (
                <button key={a.id} type="button" className="btn btn-outline" style={{ justifyContent: "flex-start" }} onClick={() => addArea(a.id)}>
                  {areaLabel(a)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
