// Supabase-backed. Same exported shapes as the Firestore version.
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
import { rowToSlot } from "@/supabase/mappers";
import type { Slot } from "@/types/slot";

type Unsubscribe = () => void;

function withAvailability(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.bookedCount < s.capacity);
}

async function fetchSlots(areaId: string, date: string, collectionType: "home" | "center"): Promise<Slot[]> {
  const { data, error } = await getSupabaseClient()
    .from("slots")
    .select("*")
    .eq("area_id", areaId)
    .eq("date", date)
    .eq("collection_type", collectionType)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map(rowToSlot);
}

export async function getAvailableSlots(areaId: string, date: string, collectionType: "home" | "center"): Promise<Slot[]> {
  return withAvailability(await fetchSlots(areaId, date, collectionType));
}

/** For rendering a booking's collection time window from its stored
 * slotId. Slots are public-read (see slots_public_read) — no
 * customer-specific data lives on this table. */
export async function getSlotById(slotId: string): Promise<Slot | null> {
  const { data, error } = await getSupabaseClient().from("slots").select("*").eq("id", slotId).maybeSingle();
  if (error) throw error;
  return data ? rowToSlot(data) : null;
}

// Realtime slot availability so two customers booking the last slot at
// once see capacity update live. Actual overbooking prevention happens
// server-side in the create_website_booking RPC's atomic UPDATE ...
// WHERE booked_count < capacity — this subscription is for UI
// freshness only, exactly like the Firestore version, except the
// server-side guarantee here is real and deployed (no undeployed
// Cloud Function involved).
export function subscribeToSlots(
  areaId: string,
  date: string,
  collectionType: "home" | "center",
  callback: (slots: Slot[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () =>
    getAvailableSlots(areaId, date, collectionType).then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges(
    `slots-${areaId}-${date}-${collectionType}`,
    { event: "*", schema: "public", table: "slots", filter: `area_id=eq.${areaId}` },
    refetch,
    onError
  );
}
