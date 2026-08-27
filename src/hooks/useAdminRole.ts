import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import type { AdminRole } from "@/types/team";

interface AdminClaims {
  role: AdminRole | null;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Reads the caller's role/hierarchy chain from their Firebase ID token
// (custom claims), NOT from any Firestore document — this is the same
// source of truth firestore.rules and every admin Cloud Function check,
// so the UI's idea of "am I staff, and what can I see" can never drift
// from what's actually enforced server-side. A stale cached token can
// under-report a just-granted role for a few minutes; getIdTokenResult
// forces a refresh once so a brand-new staff account works immediately
// after their first sign-in following account creation.
export function useAdminRole(): AdminClaims & { loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [claims, setClaims] = useState<AdminClaims>({ role: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setClaims({ role: null });
      setLoading(false);
      return;
    }
    let cancelled = false;
    user
      .getIdTokenResult(true)
      .then((token) => {
        if (cancelled) return;
        const c = token.claims as Record<string, unknown>;
        setClaims({
          role: (c.role as AdminRole) ?? null,
          superAdminId: c.superAdminId as string | undefined,
          adminId: c.adminId as string | undefined,
          subAdminId: c.subAdminId as string | undefined,
        });
      })
      .catch(() => setClaims({ role: null }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, authLoading]);

  return { ...claims, loading: loading || authLoading };
}
