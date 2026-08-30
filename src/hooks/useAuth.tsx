import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { subscribeToAuthChanges } from "@/firebase/auth";
import { firebaseConfigured } from "@/firebase/config";
import { ensureUserProfile } from "@/services/userService";
import {
  resolveStaffContextForFirebaseUser,
  subscribeToStaffRecordForFirebaseUser,
} from "@/supabase/roleService";
import { getSupabaseUserId } from "@/supabase/identity";
import { buildStaffContext } from "@/utils/roleAccess";
import type { StaffContext } from "@/types/team";
import type { UserProfile } from "@/types/user";

// AUTHORIZATION now resolves from Supabase (app_config/staff_roles),
// not Firestore — the Phase E cutover. IDENTITY stays Firebase: every
// Firestore-backed feature (bookings, patients, addresses, reports,
// notifications, this very profile) still reads/writes keyed by the
// Firebase uid, and Firestore's rules only ever trust a genuine
// Firebase ID token, so `user` below is unchanged in shape and origin.
// See src/supabase/roleService.ts's resolveStaffContextForFirebaseUser
// for exactly how the two are bridged, and its own comments for the
// fail-closed behaviour when no linked Supabase session exists (e.g.
// a phone sign-in, which never has one).

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  // Authorization context for the signed-in account, resolved from
  // Supabase (app_config + staff_roles) via the linked Supabase
  // session — never from anything the browser holds. Null while signed
  // out. Presentation only: RLS re-derives the same two inputs on
  // every request regardless of what this holds.
  staff: StaffContext | null;
  loading: boolean;
  firebaseConfigured: boolean;
  // The Supabase profiles.id (a real UUID) linked to this Firebase
  // account, or null. Every Supabase-backed customer-data call
  // (patients, addresses, bookings, reports, notifications, support,
  // profile) must use THIS — never user.uid — as the ownership id; see
  // src/supabase/identity.ts's header comment for why. Null while a
  // real user is signed in means either Supabase hasn't linked yet
  // (transient) or this is a phone-authenticated account (no Supabase
  // session is possible today — a genuine unsupported path, not a bug).
  supabaseUserId: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  staff: null,
  loading: true,
  firebaseConfigured,
  supabaseUserId: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [staff, setStaff] = useState<StaffContext | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The live users/{uid} listener for whoever is currently signed in.
  const staffUnsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }

    function stopStaffListener() {
      staffUnsubscribe.current?.();
      staffUnsubscribe.current = null;
    }

    const unsubscribe = subscribeToAuthChanges(async (nextUser) => {
      stopStaffListener();

      if (!nextUser) {
        // Signing out clears every trace of the previous session's
        // authority from local state.
        setProfile(null);
        setStaff(null);
        setSupabaseUserId(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // A sign-in that happens WHILE the app is running arrives with
      // `loading` already false — the app settled as signed-out while
      // the login page was on screen — and the role below is resolved
      // asynchronously. Without flipping this back first, every
      // consumer briefly observes the impossible state "finished
      // loading, signed in, no role". AdminProtectedRoute reads that
      // as "not an admin" and bounces a legitimate admin straight back
      // to /admin/login the moment the Google popup closes. Set
      // synchronously, before the first await, so no render can land
      // inside that gap. (On a cold load it is already true, so this
      // is a no-op there.)
      setLoading(true);

      let context: StaffContext = buildStaffContext(nextUser.uid, "", null);
      try {
        const nextProfile = await ensureUserProfile(nextUser);
        setProfile(nextProfile);
      } catch (err) {
        // The user is still validly signed in with Firebase Auth —
        // never leave them stuck on a loading screen because their
        // profile document could not be written.
        console.error("Could not load the user profile:", err);
      }

      try {
        // Resolve the role BEFORE this user is published to the rest of
        // the app, so nothing ever renders against an unknown or stale
        // role. Loading stays true until this settles, which is what
        // removes the race the old token-refresh flow had.
        context = await resolveStaffContextForFirebaseUser(nextUser.uid);
      } catch (err) {
        // Failing closed: an account whose role could not be read is
        // treated as having no role at all.
        console.error("Could not resolve the staff role:", err);
      }

      let linkedSupabaseId: string | null = null;
      try {
        linkedSupabaseId = await getSupabaseUserId(nextUser.uid);
      } catch (err) {
        console.error("Could not resolve the linked Supabase identity:", err);
      }

      setStaff(context);
      setSupabaseUserId(linkedSupabaseId);
      setUser(nextUser);
      setLoading(false);

      // Keep watching the record: a revocation or a role change is
      // meant to take effect within seconds rather than waiting out a
      // cached token. NOTE: staff_roles is not yet in the
      // supabase_realtime publication (out of scope for this cutover —
      // see subscribeToStaffRecordForFirebaseUser's own comment), so
      // this subscription is registered but inert until that is
      // enabled; the initial resolve above still runs on every sign-in
      // and full page load either way.
      staffUnsubscribe.current = subscribeToStaffRecordForFirebaseUser(nextUser.uid, setStaff);
    });

    return () => {
      stopStaffListener();
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ user, profile, staff, loading, firebaseConfigured, supabaseUserId }),
    [user, profile, staff, loading, supabaseUserId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
