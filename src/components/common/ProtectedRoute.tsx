import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import LoadingState from "./LoadingState";
import Seo from "./Seo";

// Wraps routes that require a signed-in customer (bookings, profile,
// family, addresses, reports, notifications, support, tracking). One
// noindex here covers every one of those pages at once, rather than
// repeating the same Seo call in each — they are already unreachable
// to a crawler behind the login redirect, but an explicit noindex is
// the correct defense-in-depth layer regardless (robots.txt alone is
// not an indexing control: a disallowed-but-linked URL can still be
// indexed by its anchor text without ever being crawled).
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return (
    <>
      <Seo title="My Account" description="Metro Health Lab customer account." path={location.pathname} index={false} />
      {children}
    </>
  );
}
