import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createPackage, getAllPackages, updatePackage } from "@/services/adminCatalogService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { HealthPackage } from "@/types/package";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

const EMPTY_FORM = {
  name: "",
  slug: "",
  category: "",
  description: "",
  testIds: "",
  reportTat: "",
  mrp: 0,
  sellingPrice: 0,
  homeCollection: true,
};

export default function AdminPackagesPage() {
  const { user } = useAuth();
  const packages = useAsync(getAllPackages, []);
  const [editing, setEditing] = useState<HealthPackage | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(pkg: HealthPackage) {
    if (!user) return;
    await updatePackage(user.uid, pkg.id, { active: !pkg.active });
    packages.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Packages</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Cancel" : "+ Add package"}
        </button>
      </div>

      {showCreate && user && (
        <PackageForm actorUid={user.uid} onDone={() => { setShowCreate(false); packages.retry(); }} />
      )}
      {editing && user && (
        <PackageForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); packages.retry(); }} />
      )}

      {packages.loading && <LoadingState rows={4} />}
      {packages.error && <ErrorState message={packages.error} onRetry={packages.retry} />}
      {packages.data && packages.data.length === 0 && <EmptyState icon="inventory_2" title="No packages yet" />}
      {packages.data && packages.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {packages.data.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>
                  {p.name} {!p.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {formatCurrencyInr(p.sellingPrice)} • {p.testIds.length} tests
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(p)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(p)}>
                  {p.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PackageForm({ actorUid, existing, onDone }: { actorUid: string; existing?: HealthPackage; onDone: () => void }) {
  const [form, setForm] = useState(
    existing
      ? {
          name: existing.name,
          slug: existing.slug,
          category: existing.category,
          description: existing.description,
          testIds: existing.testIds.join(", "),
          reportTat: existing.reportTat,
          mrp: existing.mrp,
          sellingPrice: existing.sellingPrice,
          homeCollection: existing.homeCollection,
        }
      : EMPTY_FORM
  );
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
      const testIds = form.testIds.split(",").map((s) => s.trim()).filter(Boolean);
      if (existing) {
        await updatePackage(actorUid, existing.id, { ...form, testIds });
      } else {
        await createPackage(actorUid, { ...form, testIds, labIds: [], active: true });
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
      <input placeholder="Slug" required value={form.slug} onChange={(e) => update("slug", e.target.value)} />
      <input placeholder="Category" required value={form.category} onChange={(e) => update("category", e.target.value)} />
      <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
      <input
        placeholder="Test IDs (comma-separated — must reference real tests)"
        value={form.testIds}
        onChange={(e) => update("testIds", e.target.value)}
      />
      <input placeholder="Report TAT" required value={form.reportTat} onChange={(e) => update("reportTat", e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="number" placeholder="MRP" required value={form.mrp} onChange={(e) => update("mrp", Number(e.target.value))} style={{ flex: 1 }} />
        <input type="number" placeholder="Selling price" required value={form.sellingPrice} onChange={(e) => update("sellingPrice", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <label><input type="checkbox" checked={form.homeCollection} onChange={(e) => update("homeCollection", e.target.checked)} /> Home collection</label>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : existing ? "Save changes" : "Create package"}
      </button>
    </form>
  );
}
