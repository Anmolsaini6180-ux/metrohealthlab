import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { User as FirebaseUser } from "firebase/auth";
import { subscribeToAuthChanges as subscribeToFirebaseAuthChanges } from "@/firebase/auth";
import { firebaseConfigured } from "@/firebase/config";
import { subscribeToAuthChanges as subscribeToSupabaseAuthChanges } from "@/supabase/auth";
import { getSupabaseClient } from "@/supabase/client";
import { ensureUserProfile } from "@/services/userService";
import { getMasterAdminUid, resolveStaffContext, subscribeToStaffRecord } from "@/supabase/roleService";
import { bridgePhoneSession } from "@/supabase/phoneBridge";
import { buildStaffContext } from "@/utils/roleAccess";
import { fromFirebasePhoneUser, fromSupabaseUser, type AppUser } from "@/types/authUser";
import type { StaffContext } from "@/types/team";
import type { UserProfile } from "@/types/user";

// Supabase Auth is the canonical session for email/Google — identity
// and data ownership are the same id now (`user.uid` === the Supabase
// profiles.id), no Firebase-uid bridge involved. Firebase Phone OTP is
// the one thing genuinely kept (no free Supabase SMS provider exists);
// a phone-only session normalizes to the exact same AppUser shape (see
// src/types/authUser.ts) so every consumer below (bookings, patients,
// addresses, reports, admin pages, ...) reads the same five fields
// regardless of which provider actually authenticated the session.
//
// Two independent SDKs means two independent listeners below, merged
// into one derived state: a live Supabase session always wins (it is
// the one that carries authorization and real data) and Firebase is
// only consulted when no Supabase session exists.

interface AuthContextValue {
  user: AppUser | null;
  profile: UserProfile | null;
  // Authorization context for the signed-in account, resolved from
  // Supabase (app_config + staff_roles) directly against the Supabase
  // session — never from anything the browser holds. Null while
  // signed out, or while signed in over phone-only (no staff account
  // has ever been phone-authenticated, since staff_roles is keyed by a
  // Supabase uuid a phone session never has). Presentation only: RLS
  // re-derives the same two inputs on every request regardless of
  // what this holds.
  staff: StaffContext | null;
  loading: boolean;
  firebaseConfigured: boolean;
  // Same as user.uid for a Supabase-authenticated account (email/
  // Google) — kept as its own field only so every existing customer-
  // data call site (bookings/patients/addresses/reports/notifications/
  // support/profile) keeps working completely unchanged. Also set for
  // a phone-only session once bridgePhoneSession() has resolved it to
  // a real Supabase identity (see the firebaseUser branch below) —
  // null only while that bridge is still in flight or has genuinely
  // failed.
  supabaseUserId: string | null;
  // Set only when a Firebase phone sign-in's bridge into a real
  // Supabase identity has failed — never paired with a populated
  // `user`/`profile` that would imply the account is actually usable.
  // The UI must show this as a real, actionable error (retry / contact
  // support), never silently render an empty patient/address list as
  // if everything were fine.
  phoneBridgeError: string | null;
  retryPhoneBridge: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  staff: null,
  loading: true,
  firebaseConfigured,
  supabaseUserId: null,
  phoneBridgeError: null,
  retryPhoneBridge: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Raw provider state, plus whether each provider has reported its
  // very first snapshot yet — both must have reported before the
  // derivation below can trust "no session" as a real answer rather
  // than "hasn't checked yet".
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [supabaseResolved, setSupabaseResolved] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseResolved, setFirebaseResolved] = useState(!firebaseConfigured);

  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [staff, setStaff] = useState<StaffContext | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneBridgeError, setPhoneBridgeError] = useState<string | null>(null);
  // Bumped by retryPhoneBridge() to force the effect below to run again
  // for the SAME firebaseUser — none of the effect's other dependencies
  // change on a retry, so without this a failed bridge would never be
  // retried just by re-rendering.
  const [bridgeRetryTick, setBridgeRetryTick] = useState(0);

  const staffUnsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToSupabaseAuthChanges((_authUser, session) => {
      setSupabaseSession(session);
      setSupabaseResolved(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const unsubscribe = subscribeToFirebaseAuthChanges((nextUser) => {
      setFirebaseUser(nextUser);
      setFirebaseResolved(true);
    });
    return unsubscribe;
  }, []);

  // Recomputes user/profile/staff whenever either provider's session
  // actually changes, once both have reported at least once.
  useEffect(() => {
    if (!supabaseResolved || !firebaseResolved) return;

    let cancelled = false;
    // See useAuth.tsx's own prior-version comment for why this is set
    // synchronously, before the first await: a sign-in that happens
    // while the app is already running otherwise briefly renders as
    // "finished loading, signed in, no role", which bounces a
    // legitimate admin straight back to /admin/login the instant the
    // OAuth redirect lands.
    setLoading(true);

    function stopStaffListener() {
      staffUnsubscribe.current?.();
      staffUnsubscribe.current = null;
    }

    async function derive() {
      stopStaffListener();

      // A live Supabase session always wins — it is the session that
      // carries authorization and every piece of real data. This also
      // covers the rare case of switching sign-in methods without
      // logging out first (a stale Firebase phone session sitting
      // alongside a fresh Supabase one).
      if (supabaseSession) {
        const appUser = fromSupabaseUser(supabaseSession.user);

        let nextStaff: StaffContext = buildStaffContext(appUser.uid, "", null);
        try {
          nextStaff = await resolveStaffContext(supabaseSession.user);
        } catch (err) {
          // Failing closed: an account whose role could not be read is
          // treated as having no role at all.
          console.error("Could not resolve the staff role:", err);
        }

        let nextProfile: UserProfile | null = null;
        try {
          nextProfile = await ensureUserProfile(appUser.uid, appUser);
        } catch (err) {
          // Still validly signed in — never leave them on a loading
          // screen because their profile could not be loaded/written.
          console.error("Could not load the user profile:", err);
        }

        if (cancelled) return;
        setUser(appUser);
        setSupabaseUserId(appUser.uid);
        setStaff(nextStaff);
        setProfile(nextProfile);
        // A real Supabase session exists now — whether from a
        // successful phone bridge or an unrelated email/Google sign-in
        // — any earlier bridge failure no longer describes reality.
        setPhoneBridgeError(null);
        setLoading(false);

        // Live: a revocation or role change takes effect within
        // seconds. NOTE: staff_roles is not yet in the
        // supabase_realtime publication, so this subscription is
        // registered but inert until that is enabled — the initial
        // resolve above still runs on every sign-in and full page
        // load either way.
        try {
          const masterUid = await getMasterAdminUid();
          if (cancelled) return;
          staffUnsubscribe.current = subscribeToStaffRecord(appUser.uid, masterUid, setStaff);
        } catch (err) {
          console.error("Could not start the staff-role subscription:", err);
        }
        return;
      }

      if (firebaseUser) {
        // Bridge this verified Firebase phone sign-in into a real
        // Supabase identity — see phoneBridge.ts's own comment for why
        // there is no client-only shortcut (RLS requires a genuine
        // Supabase session, which only the server side can mint after
        // independently verifying the Firebase ID token).
        try {
          const idToken = await firebaseUser.getIdToken();
          const { accessToken, refreshToken } = await bridgePhoneSession(idToken);
          const { error: setSessionError } = await getSupabaseClient().auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) throw setSessionError;
          if (cancelled) return;
          // Deliberately do NOT set user/profile/staff here: setSession
          // above triggers subscribeToSupabaseAuthChanges' own listener,
          // which updates `supabaseSession` and re-runs this whole
          // effect — landing in the `if (supabaseSession)` branch
          // above, the single source of truth for a real Supabase
          // identity. Loading stays true until that re-run completes.
          setPhoneBridgeError(null);
          return;
        } catch (err) {
          // A genuinely failed bridge — the account is NOT usable yet.
          // Never fall back to a local-only fake profile: that used to
          // silently show an always-empty patient/address list with no
          // explanation. Surface the real error instead so the UI can
          // show a clear retry state.
          console.error("Could not bridge phone sign-in into a Supabase identity:", err);
          if (cancelled) return;
          setUser(fromFirebasePhoneUser(firebaseUser));
          setSupabaseUserId(null);
          setStaff(null);
          setProfile(null);
          setPhoneBridgeError(err instanceof Error ? err.message : "Could not verify your phone sign-in. Please try again.");
          setLoading(false);
          return;
        }
      }

      // Signed out of both — clears every trace of the previous
      // session's authority from local state.
      if (cancelled) return;
      setUser(null);
      setSupabaseUserId(null);
      setStaff(null);
      setProfile(null);
      setPhoneBridgeError(null);
      setLoading(false);
    }

    derive();
    return () => {
      cancelled = true;
      stopStaffListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseResolved, firebaseResolved, supabaseSession, firebaseUser, bridgeRetryTick]);

  // Re-attempts the phone bridge for the SAME firebaseUser — none of
  // the effect's other dependencies change on their own after a
  // failure, so a "Retry" button needs this to force it to run again.
  function retryPhoneBridge() {
    setPhoneBridgeError(null);
    setBridgeRetryTick((n) => n + 1);
  }

  const value = useMemo(
    () => ({ user, profile, staff, loading, firebaseConfigured, supabaseUserId, phoneBridgeError, retryPhoneBridge }),
    [user, profile, staff, loading, supabaseUserId, phoneBridgeError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
