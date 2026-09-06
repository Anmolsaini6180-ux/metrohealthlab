import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import LoadingState from "./LoadingState";
import Seo from "./Seo";

// /agent is specifically the COLLECTION_AGENT's own workspace — other
// staff roles get redirected to /admin instead (their dashboard means
// something different: team-wide, not "my own assignments"), same
// server-side-truth reasoning as AdminProtectedRoute.
export default function AgentProtectedRoute({ children }: { children: ReactNode }) {
  const { role, loading } = useAdminRole();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking access..." />;
  if (!role) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  if (role !== "COLLECTION_AGENT") return <Navigate to="/admin" replace />;
  return (
    <>
      <Seo title="Agent" description="Metro Health Lab collection agent workspace." path={location.pathname} index={false} />
      {children}
    </>
  );
}
