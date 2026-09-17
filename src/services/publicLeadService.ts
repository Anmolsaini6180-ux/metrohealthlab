// Supabase-backed. Separate from adminMarketingService.ts on purpose:
// everything there requires can_manage_catalog() (staff only), while
// this is the one deliberately public-callable exception — a real
// website visitor, signed in or not, capturing their own callback
// request. Goes through create_callback_lead (SECURITY DEFINER, no
// staff check) rather than a direct `leads` insert, because
// leads_all_staff is the only INSERT policy on that table — a plain
// customer/anon insert would be rejected by RLS otherwise.
import { getSupabaseClient } from "@/supabase/client";

/**
 * Submits a "Request a callback" lead. Throws with a message safe to
 * show directly to the visitor (the RPC's own validation errors are
 * already human-readable, e.g. "Enter a valid 10-digit mobile number.").
 */
export async function createCallbackLead(name: string, phone: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("create_callback_lead", {
    p_name: name,
    p_phone: phone,
  });
  if (error) throw error;
  return data as string;
}
