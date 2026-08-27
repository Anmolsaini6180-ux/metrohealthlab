import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createTest, getAllTests, updateTest } from "@/services/adminCatalogService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { DiagnosticTest } from "@/types/test";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

const EMPTY_FORM = {
  name: "",
  slug: "",
  categoryId: "",
  description: "",
  sampleType: "",
  reportTat: "",
  mrp: 0,
  sellingPrice: 0,
  homeCollection: true,
  centerCollection: true,
  fastingRequired: false,
};

export default function AdminTestsPage() {
  const { user } = useAuth();
  const tests = useAsync(getAllTests, []);
  const [editing, setEditing] = useState<DiagnosticTest | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(test: DiagnosticTest) {
    if (!user) return;
    await updateTest(user.uid, test.id, { active: !test.active });
    tests.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Tests</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Cancel" : "+ Add test"}
        </button>
      </div>

      {showCreate && user && (
        <TestForm
          actorUid={user.uid}
          onDone={() => {
            setShowCreate(false);
            tests.retry();
          }}
        />
      )}

      {editing && user && (
        <TestForm
          actorUid={user.uid}
          existing={editing}
          onDone={() => {
            setEditing(null);
            tests.retry();
          }}
        />
      )}

      {tests.loading && <LoadingState rows={4} />}
      {tests.error && <ErrorState message={tests.error} onRetry={tests.retry} />}
      {tests.data && tests.data.length === 0 && <EmptyState icon="science" title="No tests yet" description="Add your first test above." />}
      {tests.data && tests.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {tests.data.map((t) => (
            <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>
                  {t.name} {!t.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{formatCurrencyInr(t.sellingPrice)} • {t.sampleType}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(t)}>
                  {t.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestForm({
  actorUid,
  existing,
  onDone,
}: {
  actorUid: string;
  existing?: DiagnosticTest;
  onDone: () => void;
}) {
  const [form, setForm] = useState(
    existing
      ? {
          name: existing.name,
          slug: existing.slug,
          categoryId: existing.categoryId,
          description: existing.description,
          sampleType: existing.sampleType,
          reportTat: existing.reportTat,
          mrp: existing.mrp,
          sellingPrice: existing.sellingPrice,
          homeCollection: existing.homeCollection,
          centerCollection: existing.centerCollection,
          fastingRequired: existing.fastingRequired,
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
      if (existing) {
        await updateTest(actorUid, existing.id, form);
      } else {
        await createTest(actorUid, { ...form, labIds: [], active: true });
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
      <input placeholder="Slug (url-friendly)" required value={form.slug} onChange={(e) => update("slug", e.target.value)} />
      <input placeholder="Category ID" required value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)} />
      <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
      <input placeholder="Sample type (e.g. Blood)" required value={form.sampleType} onChange={(e) => update("sampleType", e.target.value)} />
      <input placeholder="Report TAT (e.g. 24 hours)" required value={form.reportTat} onChange={(e) => update("reportTat", e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="number" placeholder="MRP" required value={form.mrp} onChange={(e) => update("mrp", Number(e.target.value))} style={{ flex: 1 }} />
        <input type="number" placeholder="Selling price" required value={form.sellingPrice} onChange={(e) => update("sellingPrice", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <label><input type="checkbox" checked={form.homeCollection} onChange={(e) => update("homeCollection", e.target.checked)} /> Home collection</label>
      <label><input type="checkbox" checked={form.centerCollection} onChange={(e) => update("centerCollection", e.target.checked)} /> Center collection</label>
      <label><input type="checkbox" checked={form.fastingRequired} onChange={(e) => update("fastingRequired", e.target.checked)} /> Fasting required</label>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : existing ? "Save changes" : "Create test"}
      </button>
    </form>
  );
}
