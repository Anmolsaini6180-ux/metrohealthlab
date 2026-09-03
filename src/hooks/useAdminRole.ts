import { useAuth } from "./useAuth";
import { buildStaffContext } from "@/utils/roleAccess";
import type { AdminRole, StaffContext } from "@/types/team";

// Reads the caller's role and hierarchy chain from the authorization
// context AuthProvider resolved out of Supabase (app_config +
// staff_roles, via the linked Supabase session) — the same two tables
// RLS reads on every request, so the UI's idea of "am I staff, and
// what can I see" cannot drift from what is actually enforced.
//
// There is no token/claim refresh to wait for and no second async
// hop: the provider does not publish a signed-in user until the role
// has been resolved, so `loading` is false only once `role` is
// truthful, and a live subscription keeps it current afterwards.
//
// UI convenience, not security. Hiding a menu item is not what stops
// anyone; the security rules are.
export function useAdminRole(): StaffContext & { role: AdminRole | null; loading: boolean } {
  const { user, staff, loading } = useAuth();
  const context = staff ?? buildStaffContext(user?.uid ?? "", "", null);
  return { ...context, loading };
}
