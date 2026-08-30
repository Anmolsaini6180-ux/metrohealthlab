// Supabase-backed. Was reading Firestore's serviceAreas collection
// while create_website_booking (the RPC that actually creates the
// booking) already validates p_service_area_id against Supabase's
// service_areas table — a customer could pass a pincode check here
// that the real booking then rejected, or vice versa, if the two ever
// drifted. service_areas_public_read (RLS: true) already makes this
// table world-readable, same boundary Firestore's own rule gave it.
import { getSupabaseClient } from "@/supabase/client";
import { rowToServiceArea } from "@/supabase/mappers";
import type { ServiceArea } from "@/types/serviceArea";

export async function checkServiceability(pincode: string): Promise<ServiceArea | null> {
  const { data, error } = await getSupabaseClient()
    .from("service_areas")
    .select("*")
    .eq("pincode", pincode.trim())
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToServiceArea(data) : null;
}
