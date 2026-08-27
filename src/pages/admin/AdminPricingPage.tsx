import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getAllTests, getAllPackages, getLabPricingForItem, createLabPricing, updateLabPricing, getAllLabs } from "@/services/adminCatalogService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { LabPricing } from "@/types/lab";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminPricingPage() {
  const { user } = useAuth();
  const tests = useAsync(getAllTests, []);
  const packages = useAsync(getAllPackages, []);
  const labs = useAsync(getAllLabs, []);

  const [itemType, setItemType] = useState<"test" | "package">("test");
  const [itemId, setItemId] = useState<string>("");

  const pricing = useAsync(
    () => (itemId ? getLabPricingForItem(itemType, itemId) : Promise.resolve([])),
    [itemType, itemId]
  );

  const items = itemType === "test" ? tests.data ?? [] : packages.data ?? [];
  const pricedLabIds = new Set((pricing.data ?? []).map((p) => p.labId));
  const unpricedLabs = (labs.data ?? []).filter((l) => !pricedLabIds.has(l.id));

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Lab-wise pricing</h1>

      <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
        <select value={itemType} onChange={(e) => { setItemType(e.target.value as "test" | "package"); setItemId(""); }} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="test">Test</option>
          <option value="package">Package</option>
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)", minWidth: 220 }}>
          <option value="">Select {itemType}...</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      {!itemId && <EmptyState icon="payments" title="Select a test or package" description="Choose an item above to manage its lab-wise pricing." />}

      {itemId && (
        <>
          {pricing.loading && <LoadingState rows={2} />}
          {pricing.error && <ErrorState message={pricing.error} onRetry={pricing.retry} />}
          {pricing.data && (
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {pricing.data.map((p) => (
                <PricingRow
                  key={p.id}
                  pricing={p}
                  labName={(labs.data ?? []).find((l) => l.id === p.labId)?.name ?? p.labId}
                  actorUid={user?.uid ?? ""}
                  onSaved={() => pricing.retry()}
                />
              ))}
              {pricing.data.length === 0 && <EmptyState icon="storefront" title="No lab pricing set yet for this item" />}
            </div>
          )}

          {unpricedLabs.length > 0 && user && (
            <div style={{ marginTop: "var(--space-md)" }}>
              <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Add pricing for another lab</h2>
              <AddPricingForm
                actorUid={user.uid}
                itemType={itemType}
                itemId={itemId}
                availableLabs={unpricedLabs}
                onSaved={() => pricing.retry()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PricingRow({
  pricing,
  labName,
  actorUid,
  onSaved,
}: {
  pricing: LabPricing;
  labName: string;
  actorUid: string;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(pricing.price);
  const [mrp, setMrp] = useState(pricing.mrp);
  const [active, setActive] = useState(pricing.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await updateLabPricing(actorUid, pricing.id, { price, mrp, active });
      onSaved();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center", flexWrap: "wrap" }}>
      <p style={{ fontWeight: 600, minWidth: 140 }}>{labName}</p>
      <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ width: 100, padding: 6 }} />
      <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>MRP</span>
      <input type="number" value={mrp} onChange={(e) => setMrp(Number(e.target.value))} style={{ width: 100, padding: 6 }} />
      <label style={{ fontSize: "var(--text-sm)" }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <button className="btn btn-outline" onClick={handleSave} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      {error && <span style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>{error}</span>}
      <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Currently {formatCurrencyInr(pricing.price)}</span>
    </div>
  );
}

function AddPricingForm({
  actorUid,
  itemType,
  itemId,
  availableLabs,
  onSaved,
}: {
  actorUid: string;
  itemType: "test" | "package";
  itemId: string;
  availableLabs: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [labId, setLabId] = useState("");
  const [price, setPrice] = useState(0);
  const [mrp, setMrp] = useState(0);
  const [collectionType, setCollectionType] = useState<"home" | "center" | "both">("both");
  const [reportTat, setReportTat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!labId) return;
    setBusy(true);
    setError(null);
    try {
      await createLabPricing(actorUid, {
        labId,
        [itemType === "test" ? "testId" : "packageId"]: itemId,
        price,
        mrp,
        collectionType,
        reportTat,
        active: true,
      } as never);
      onSaved();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
      <select required value={labId} onChange={(e) => setLabId(e.target.value)} style={{ padding: 6 }}>
        <option value="">Choose lab...</option>
        {availableLabs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input type="number" placeholder="Price" required value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ width: 100, padding: 6 }} />
      <input type="number" placeholder="MRP" required value={mrp} onChange={(e) => setMrp(Number(e.target.value))} style={{ width: 100, padding: 6 }} />
      <select value={collectionType} onChange={(e) => setCollectionType(e.target.value as typeof collectionType)} style={{ padding: 6 }}>
        <option value="both">Home & Center</option>
        <option value="home">Home only</option>
        <option value="center">Center only</option>
      </select>
      <input placeholder="Report TAT" required value={reportTat} onChange={(e) => setReportTat(e.target.value)} style={{ padding: 6 }} />
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Adding..." : "Add"}</button>
      {error && <span style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>{error}</span>}
    </form>
  );
}
