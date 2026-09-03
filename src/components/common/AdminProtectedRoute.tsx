import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import LoadingState from "./LoadingState";

// Even a user who manually types /admin into the URL bar is rejected
// here unless AuthProvider resolved a staff role for them out of
// Supabase (app_config + staff_roles, via the linked Supabase session)
// — the same tables RLS re-reads on every request. There are no custom
// Firebase Auth claims in this project: authorization lives entirely
// in Supabase, checked by RLS and by can_manage_catalog()/similar
// SECURITY DEFINER functions server-side, not by a Firebase ID token
// claim.
//
// This is UX-level convenience only; the real enforcement is
// server-side regardless of whether this component exists. It relies
// on AuthProvider's invariant that `loading` is false only once the
// role is truthful — otherwise a just-completed sign-in would be read
// as "no role" and redirected away.
export default function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { role, loading } = useAdminRole();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking access..." />;
  if (!role) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
