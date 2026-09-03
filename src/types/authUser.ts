// The one user shape every consumer in this app reads (`useAuth().user`)
// regardless of which provider actually authenticated the session.
// Every existing consumer already only ever read these five fields off
// the old Firebase User — confirmed by grepping the whole src/ tree
// before this migration — so normalizing to exactly this shape means
// zero changes were needed in bookings/patients/addresses/reports/
// notifications/admin pages/etc.
export interface AppUser {
  /**
   * The Supabase auth.users.id (a real uuid) for an email/Google
   * account — identity and data ownership are the same id now, no
   * bridge required. For a phone-only account (Supabase has no free
   * SMS provider, so one is never established) this is the Firebase
   * uid instead; see `provider` to tell the two apart.
   */
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  /** Which system actually authenticated this session. */
  provider: "supabase" | "firebase-phone";
}

// Kept as `unknown`-typed inputs (rather than importing the real SDK
// types here) so this one small file has no dependency on either SDK —
// every call site already has a real @supabase/supabase-js User or
// firebase/auth User in hand and passes it in typed.
interface SupabaseLikeUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export function fromSupabaseUser(user: SupabaseLikeUser): AppUser {
  const meta = user.user_metadata ?? {};
  return {
    uid: user.id,
    email: user.email ?? null,
    displayName: (meta.full_name as string) ?? (meta.name as string) ?? null,
    phoneNumber: user.phone ?? null,
    photoURL: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
    provider: "supabase",
  };
}

interface FirebaseLikeUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
}

export function fromFirebasePhoneUser(user: FirebaseLikeUser): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    photoURL: user.photoURL,
    provider: "firebase-phone",
  };
}
