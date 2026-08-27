import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { subscribeToAuthChanges } from "@/firebase/auth";
import { firebaseConfigured } from "@/firebase/config";
import { ensureUserProfile } from "@/services/userService";
import { syncMyRole } from "@/services/authService";
import type { UserProfile } from "@/types/user";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  firebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  firebaseConfigured,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToAuthChanges(async (nextUser) => {
      if (nextUser) {
        try {
          const nextProfile = await ensureUserProfile(nextUser);
          setProfile(nextProfile);
          // Resolve this account's staff role server-side (master
          // admin, an email-keyed assignment, or none) and wait for the
          // claim to actually be written BEFORE this user is considered
          // "signed in" anywhere else in the app. Without this await,
          // useAdminRole's own token check (which fires the instant
          // `user` is set below) can run before the claim exists —
          // checking too early and never re-checking, since nothing
          // else changes to make it re-check later. Awaiting here and
          // then forcing a fresh token means that race can't happen,
          // and also means a revoked role disappears on the very next
          // sign-in rather than lingering in a stale token.
          await syncMyRole();
          await nextUser.getIdToken(true);
        } catch (err) {
          // Whatever failed above (profile creation, the grant check),
          // the user is still validly signed in with Firebase Auth —
          // never leave them stuck on a loading screen because of it.
          console.error("Post-sign-in setup failed:", err);
        }
      } else {
        setProfile(null);
      }
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, firebaseConfigured }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
