import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import LoadingState from "./LoadingState";

// Even a user who manually types /admin into the URL bar is rejected
// here unless AuthProvider resolved a staff role for them out of
// Firestore (system/config + users/{uid}) — the same two documents
// firestore.rules re-reads on every request. There are no custom
// claims in this project: it runs on the Spark plan, so there is no
// Cloud Function to mint them.
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
