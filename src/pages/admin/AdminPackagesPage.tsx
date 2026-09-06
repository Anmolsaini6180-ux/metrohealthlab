import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createPackage, getAllPackages, getAllTests, updatePackage } from "@/services/adminCatalogService";
import { formatCurrencyInr } from "@/services/pricingService";
import { computeMargin } from "@/utils/margin";
import { displayedTestCount } from "@/utils/packageDisplay";
import type { HealthPackage } from "@/types/package";
import type { DiagnosticTest } from "@/types/test";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

const EMPTY_FORM = {
  name: "",
  slug: "",
  category: "",
  description: "",
  testIds: [] as string[],
  reportTat: "",
  mrp: 0,
  sellingPrice: 0,
  homeCollection: true,
  tp: "",
  testCountOverride: "",
  seoTitle: "",
  seoDescription: "",
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
                  {formatCurrencyInr(p.sellingPrice)} • {displayedTestCount(p)} tests
                  {p.testCountOverride != null && p.testCountOverride !== p.testIds.length && (
                    <span> (displayed count overridden — {p.testIds.length} actually linked)</span>
                  )}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                  {(() => {
                    const margin = computeMargin(p.sellingPrice, p.tp);
                    if (p.tp == null) return "TP not set";
                    return `TP ${formatCurrencyInr(p.tp)} • Margin ${formatCurrencyInr(margin!.amount)}${margin!.percent != null ? ` (${margin!.percent.toFixed(0)}%)` : ""}`;
                  })()}
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
          testIds: existing.testIds,
          reportTat: existing.reportTat,
          mrp: existing.mrp,
          sellingPrice: existing.sellingPrice,
          homeCollection: existing.homeCollection,
          tp: existing.tp != null ? String(existing.tp) : "",
          testCountOverride: existing.testCountOverride != null ? String(existing.testCountOverride) : "",
          seoTitle: existing.seoTitle ?? "",
          seoDescription: existing.seoDescription ?? "",
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
      // Blank means "not entered" (null), never a real 0 — see
      // computeMargin's own comment on why that distinction matters.
      const tp = form.tp.trim() === "" ? null : Number(form.tp);
      // Blank means "no override" (null) — falls back to the real
      // linked-tests count, exactly like every package before this
      // field existed. A deliberate 0 is a real override, not "unset".
      const testCountOverride = form.testCountOverride.trim() === "" ? null : Number(form.testCountOverride);
      if (existing) {
        await updatePackage(actorUid, existing.id, { ...form, tp, testCountOverride });
      } else {
        await createPackage(actorUid, { ...form, tp, testCountOverride, labIds: [], active: true });
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
      <TestPicker selectedIds={form.testIds} onChange={(testIds) => update("testIds", testIds)} />
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
          "X Tests" shown to customers <span className="text-soft">(optional override)</span>
        </span>
        <input
          type="number"
          min={0}
          placeholder={`Leave blank to show the real linked count (${form.testIds.length})`}
          value={form.testCountOverride}
          onChange={(e) => update("testCountOverride", e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          For a bundled panel marketed as, e.g., "70+ parameters" that doesn't map 1:1 to individually listed tests.
          This only changes the number shown on the package card — it does not add or remove tests above.
        </span>
      </label>
      <input placeholder="Report TAT" required value={form.reportTat} onChange={(e) => update("reportTat", e.target.value)} />
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
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : existing ? "Save changes" : "Create package"}
      </button>
    </form>
  );
}

/**
 * Search-and-pick test selector — replaces what used to be a raw
 * "type comma-separated test IDs" text box. An admin has no way to
 * know a test's internal id by sight, so that field was unusable in
 * practice: every package this session found had 0 linked tests
 * because of it. Picks by real name instead, and persists through the
 * exact same testIds: string[] path createPackage/updatePackage
 * already had (see adminCatalogService.ts's replacePackageTests) —
 * only the input UX changes here, not the data model.
 */
function TestPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const allTests = useAsync(getAllTests, []);
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map((allTests.data ?? []).map((t) => [t.id, t])), [allTests.data]);
  const selectedTests = selectedIds.map((id) => byId.get(id)).filter((t): t is DiagnosticTest => !!t);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = allTests.data ?? [];
    const unselected = pool.filter((t) => !selectedIds.includes(t.id));
    if (!q) return unselected.slice(0, 20);
    return unselected.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 20);
  }, [allTests.data, search, selectedIds]);

  function addTest(id: string) {
    onChange([...selectedIds, id]);
    setSearch("");
  }

  function removeTest(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
        Tests included {selectedIds.length > 0 && <span className="text-soft">({selectedIds.length})</span>}
      </span>

      {selectedTests.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedTests.map((t) => (
            <span key={t.id} className="mh-removable-chip">
              {t.name}
              <button type="button" aria-label={`Remove ${t.name}`} onClick={() => removeTest(t.id)}>
                <span className="mi" aria-hidden="true">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
      {/* A test id in the package's own testIds that no longer resolves
          to a real test row (deleted/renamed elsewhere) — surfaced
          honestly instead of silently dropped, since saving the form
          as-is would otherwise remove it from the package without the
          admin ever having chosen to. */}
      {selectedIds.length > selectedTests.length && (
        <p style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>
          {selectedIds.length - selectedTests.length} linked test id(s) no longer match a real test and will be
          dropped on save.
        </p>
      )}

      {allTests.loading && <LoadingState rows={1} />}
      {allTests.error && <ErrorState message={allTests.error} onRetry={allTests.retry} />}

      {allTests.data && (
        <>
          <input
            type="search"
            placeholder="Search tests by name to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(search.trim() || results.length > 0) && (
            <div className="card" style={{ maxHeight: 200, overflowY: "auto", display: "grid", gap: 4 }}>
              {results.length === 0 && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No tests match.</p>}
              {results.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="btn btn-outline"
                  style={{ justifyContent: "space-between" }}
                  onClick={() => addTest(t.id)}
                >
                  <span>{t.name}</span>
                  <span className="text-soft">{formatCurrencyInr(t.sellingPrice)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
