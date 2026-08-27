import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import LoadingState from "./LoadingState";

// Even a user who manually types /admin into the URL bar is rejected
// here unless their ID token actually carries a staff role custom
// claim — the same claim firestore.rules and every admin Cloud
// Function check. This is UX-level convenience only; the real
// enforcement is server-side regardless of whether this component
// exists.
export default function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { role, loading } = useAdminRole();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking access..." />;
  if (!role) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
