// Supabase-backed. Same exported shapes as the Firestore version.
import { getSupabaseClient } from "@/supabase/client";
import { rowToLab, rowToLabPricing } from "@/supabase/mappers";
import type { Lab, LabPricing } from "@/types/lab";

const DEFAULT_LIST_LIMIT = 200;
type Unsubscribe = () => void;

export async function getActiveLabs(): Promise<Lab[]> {
  const { data, error } = await getSupabaseClient().from("labs").select("*").eq("active", true).limit(DEFAULT_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToLab);
}

export async function getLabById(id: string): Promise<Lab | null> {
  const { data, error } = await getSupabaseClient().from("labs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToLab(data) : null;
}

export function subscribeToActiveLabs(callback: (labs: Lab[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const refetch = () => getActiveLabs().then(callback).catch((err) => onError?.(err));
  refetch();
  const channel = getSupabaseClient()
    .channel("labs-active")
    .on("postgres_changes", { event: "*", schema: "public", table: "labs" }, refetch)
    .subscribe();
  return () => getSupabaseClient().removeChannel(channel);
}

export async function getLabPricingForTest(testId: string): Promise<LabPricing[]> {
  const { data, error } = await getSupabaseClient().from("lab_pricing").select("*").eq("test_id", testId).eq("active", true);
  if (error) throw error;
  return (data ?? []).map(rowToLabPricing);
}

export async function getLabPricingForPackage(packageId: string): Promise<LabPricing[]> {
  const { data, error } = await getSupabaseClient().from("lab_pricing").select("*").eq("package_id", packageId).eq("active", true);
  if (error) throw error;
  return (data ?? []).map(rowToLabPricing);
}

// Realtime variants — same scoping rationale as the Firestore version's
// own comment: detail pages only, not list/browse pages.
export function subscribeToLabPricingForTest(
  testId: string,
  callback: (pricing: LabPricing[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getLabPricingForTest(testId).then(callback).catch((err) => onError?.(err));
  refetch();
  const channel = getSupabaseClient()
    .channel(`lab-pricing-test-${testId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "lab_pricing", filter: `test_id=eq.${testId}` }, refetch)
    .subscribe();
  return () => getSupabaseClient().removeChannel(channel);
}

export function subscribeToLabPricingForPackage(
  packageId: string,
  callback: (pricing: LabPricing[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getLabPricingForPackage(packageId).then(callback).catch((err) => onError?.(err));
  refetch();
  const channel = getSupabaseClient()
    .channel(`lab-pricing-package-${packageId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "lab_pricing", filter: `package_id=eq.${packageId}` }, refetch)
    .subscribe();
  return () => getSupabaseClient().removeChannel(channel);
}
