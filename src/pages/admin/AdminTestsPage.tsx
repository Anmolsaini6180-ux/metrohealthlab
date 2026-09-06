import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createTest, getAllTestCategories, getAllTests, updateTest } from "@/services/adminCatalogService";
import { formatCurrencyInr } from "@/services/pricingService";
import { computeMargin } from "@/utils/margin";
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
  tp: "",
  seoTitle: "",
  seoDescription: "",
};

export default function AdminTestsPage() {
  const { user } = useAuth();
  const tests = useAsync(getAllTests, []);
  const categories = useAsync(getAllTestCategories, []);
  const categoryNameById = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
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
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {formatCurrencyInr(t.sellingPrice)} • {t.sampleType} • {categoryNameById.get(t.categoryId) ?? "Uncategorized"}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                  {(() => {
                    const margin = computeMargin(t.sellingPrice, t.tp);
                    if (t.tp == null) return "TP not set";
                    return `TP ${formatCurrencyInr(t.tp)} • Margin ${formatCurrencyInr(margin!.amount)}${margin!.percent != null ? ` (${margin!.percent.toFixed(0)}%)` : ""}`;
                  })()}
                </p>
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
          tp: existing.tp != null ? String(existing.tp) : "",
          seoTitle: existing.seoTitle ?? "",
          seoDescription: existing.seoDescription ?? "",
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const categories = useAsync(getAllTestCategories, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Blank means "not entered" (null), never a real 0 — see
      // computeMargin's own comment on why that distinction matters.
      const tp = form.tp.trim() === "" ? null : Number(form.tp);
      if (existing) {
        await updateTest(actorUid, existing.id, { ...form, tp });
      } else {
        await createTest(actorUid, { ...form, tp, labIds: [], active: true });
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
      {/* An admin has no way to know a category's raw id by sight — was
          a required free-text field, which meant creating a test
          without one already open in another tab was effectively
          blocked. Picks by real category name instead; same
          categoryId: string this form always sent. */}
      {categories.loading && <LoadingState rows={1} />}
      {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
      {categories.data && (
        <select required value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
          <option value="" disabled>
            Choose a category...
          </option>
          {categories.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />

      {/* Optional — the public test page falls back to a description
          built from the name/sample-type/report-TAT when these are
          left blank (see TestDetailPage.tsx's own Seo call). Only
          worth filling in when the auto-generated version genuinely
          isn't the best title/description for search results. */}
      <details>
        <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600 }}>SEO (optional)</summary>
        <div style={{ display: "grid", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
          <input
            placeholder="SEO title override (leave blank to auto-generate)"
            value={form.seoTitle}
            onChange={(e) => update("seoTitle", e.target.value)}
          />
          <textarea
            placeholder="SEO description override (leave blank to auto-generate)"
            rows={2}
            maxLength={200}
            value={form.seoDescription}
            onChange={(e) => update("seoDescription", e.target.value)}
          />
        </div>
      </details>

      <input placeholder="Sample type (e.g. Blood)" required value={form.sampleType} onChange={(e) => update("sampleType", e.target.value)} />
      <input placeholder="Report TAT (e.g. 24 hours)" required value={form.reportTat} onChange={(e) => update("reportTat", e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="number" placeholder="MRP" required value={form.mrp} onChange={(e) => update("mrp", Number(e.target.value))} style={{ flex: 1 }} />
        <input type="number" placeholder="Selling price" required value={form.sellingPrice} onChange={(e) => update("sellingPrice", Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <div>
        <input
          type="number"
          placeholder="TP / internal cost (staff-only, never shown to customers)"
          value={form.tp}
          onChange={(e) => update("tp", e.target.value)}
          min={0}
        />
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
          {form.tp.trim() === ""
            ? "Leave blank if not yet known — shown as \"TP not set\", never as a fake ₹0."
            : (() => {
                const margin = computeMargin(form.sellingPrice, Number(form.tp));
                return `Margin: ${formatCurrencyInr(margin!.amount)}${margin!.percent != null ? ` (${margin!.percent.toFixed(0)}%)` : ""}`;
              })()}
        </p>
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
