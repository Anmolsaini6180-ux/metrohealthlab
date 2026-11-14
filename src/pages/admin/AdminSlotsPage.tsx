import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createSlot, getAllServiceAreas, getAllSlots, updateSlot } from "@/services/adminCatalogService";
import type { Slot } from "@/types/slot";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminSlotsPage() {
  const { user } = useAuth();
  const slots = useAsync(() => getAllSlots(), []);
  const areas = useAsync(getAllServiceAreas, []);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(slot: Slot) {
    if (!user) return;
    await updateSlot(user.uid, slot.id, { active: !slot.active });
    slots.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Slots</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add slot"}</button>
      </div>

      {showCreate && user && (
        <SlotForm actorUid={user.uid} areas={areas.data ?? []} onDone={() => { setShowCreate(false); slots.retry(); }} />
      )}

      {slots.loading && <LoadingState rows={3} />}
      {slots.error && <ErrorState message={slots.error} onRetry={slots.retry} />}
      {slots.data && slots.data.length === 0 && <EmptyState icon="event" title="No slots yet" />}
      {slots.data && slots.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {slots.data.map((s) => (
            <div key={s.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{s.date} • {s.startTime}–{s.endTime} {!s.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {s.collectionType} • {s.bookedCount}/{s.capacity} booked • area: {s.areaId}
                </p>
              </div>
              <button className="btn btn-outline" onClick={() => handleToggleActive(s)}>{s.active ? "Deactivate" : "Activate"}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlotForm({ actorUid, areas, onDone }: { actorUid: string; areas: { id: string; city: string; area?: string }[]; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [areaId, setAreaId] = useState("");
  const [collectionType, setCollectionType] = useState<"home" | "center">("home");
  const [capacity, setCapacity] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!areaId) {
      setError("Choose a service area.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createSlot(actorUid, { date, startTime, endTime, areaId, collectionType, capacity, active: true });
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: 1 }} />
        <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ flex: 1 }} />
      </div>
      <select required value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        <option value="">Choose service area...</option>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.city}{a.area ? ` — ${a.area}` : ""}</option>)}
      </select>
      <select value={collectionType} onChange={(e) => setCollectionType(e.target.value as "home" | "center")}>
        <option value="home">Home collection</option>
        <option value="center">Center visit</option>
      </select>
      <input type="number" placeholder="Capacity" required min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Create slot"}</button>
    </form>
  );
}
