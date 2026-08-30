// Supabase-backed. RLS enforces user_id = auth.uid(), same boundary as
// Firestore's isOwner(userId) rule.
import { getSupabaseClient } from "@/supabase/client";
import { rowToAddress } from "@/supabase/mappers";
import type { Address } from "@/types/address";

export async function getAddresses(userId: string): Promise<Address[]> {
  const { data, error } = await getSupabaseClient().from("addresses").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(rowToAddress);
}

export async function addAddress(
  userId: string,
  data: Omit<Address, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("addresses")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      label: data.label,
      house: data.house,
      street: data.street,
      area: data.area,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      landmark: data.landmark ?? null,
      is_default: data.isDefault ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateAddress(
  addressId: string,
  data: Partial<Omit<Address, "id" | "userId" | "createdAt">>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.label !== undefined) patch.label = data.label;
  if (data.house !== undefined) patch.house = data.house;
  if (data.street !== undefined) patch.street = data.street;
  if (data.area !== undefined) patch.area = data.area;
  if (data.city !== undefined) patch.city = data.city;
  if (data.state !== undefined) patch.state = data.state;
  if (data.pincode !== undefined) patch.pincode = data.pincode;
  if (data.landmark !== undefined) patch.landmark = data.landmark;
  if (data.isDefault !== undefined) patch.is_default = data.isDefault;
  const { error } = await getSupabaseClient().from("addresses").update(patch).eq("id", addressId);
  if (error) throw error;
}

export async function deleteAddress(addressId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("addresses").delete().eq("id", addressId);
  if (error) throw error;
}

// setDefaultAddress needs its OWN address unset before the new one can
// be set default — the partial unique index (one default per user)
// would otherwise reject a moment where two rows are briefly both
// default. Unset-then-set (two statements) is the safe order; the
// reverse order can violate the constraint if it runs first.
export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error: clearError } = await client
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .neq("id", addressId);
  if (clearError) throw clearError;
  const { error: setError } = await client.from("addresses").update({ is_default: true }).eq("id", addressId);
  if (setError) throw setError;
}
