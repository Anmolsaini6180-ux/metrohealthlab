// Supabase-backed. profiles.id is the Supabase auth uuid — never the
// Firebase uid — same bridge every other customer-data table uses
// (see src/supabase/identity.ts's header comment for why a Firebase
// uid must never be written into a uuid column).
//
// A Firebase account with no linked Supabase session yet has no
// profiles row it could own. That is only ever true for a phone-only
// sign-in (Supabase has no free SMS provider, so no Supabase session
// is ever established for one) or the brief instant before Google/
// email linking settles. For that case this falls back to a live,
// unpersisted view built directly from the Firebase user record —
// exactly the fields Firestore ever held for that account, and
// harmless not to persist since this app has no profile-editing
// screen a phone-only user could reach anyway.
import { getSupabaseClient } from "@/supabase/client";
import type { UserProfile } from "@/types/user";
import type { User } from "firebase/auth";

function fromFirebaseUser(user: User, extraFields?: Partial<Pick<UserProfile, "name" | "phone">>): UserProfile {
  return {
    id: user.uid,
    ...(user.displayName ? { name: user.displayName } : {}),
    ...(user.email ? { email: user.email } : {}),
    ...(user.phoneNumber ? { phone: user.phoneNumber } : {}),
    ...(user.photoURL ? { photoUrl: user.photoURL } : {}),
    ...(extraFields?.name ? { name: extraFields.name } : {}),
    ...(extraFields?.phone ? { phone: extraFields.phone } : {}),
    accountType: "customer",
    createdAt: null,
    updatedAt: null,
  };
}

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    phone: (row.phone as string | null) ?? undefined,
    photoUrl: (row.photo_url as string | null) ?? undefined,
    dateOfBirth: (row.date_of_birth as string | null) ?? undefined,
    gender: (row.gender as UserProfile["gender"]) ?? undefined,
    accountType: "customer",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserProfile(supabaseUserId: string): Promise<UserProfile | null> {
  const { data, error } = await getSupabaseClient().from("profiles").select("*").eq("id", supabaseUserId).maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data) : null;
}

/**
 * Called right after sign-in so every authenticated account with a
 * linked Supabase session has a profiles row to hang patients/
 * addresses/bookings off of (profiles_insert_self RLS allows exactly
 * this: a freshly authenticated user writing their own row, no
 * service-role key involved).
 *
 * KNOWN RACE, FIXED (kept from the Firestore version of this file):
 * AuthProvider's onAuthStateChanged handler calls this on every
 * sign-in, including the very same sign-in registerAndLoginWithEmail
 * just performed — the two calls can run concurrently. extraFields
 * lets a caller that already knows name/phone (i.e.
 * registerAndLoginWithEmail) include them in this same write; the
 * upsert is safe regardless of which of the two concurrent calls lands
 * second, since neither ever clears a column it doesn't mention.
 *
 * If nothing has changed since the last call (no extraFields, and a
 * row already exists), this returns the existing row without writing
 * — sign-in happens on every page load, and there's no reason to touch
 * the row when nothing new is known.
 */
export async function ensureUserProfile(
  supabaseUserId: string | null,
  user: User,
  extraFields?: Partial<Pick<UserProfile, "name" | "phone">>
): Promise<UserProfile> {
  if (!supabaseUserId) return fromFirebaseUser(user, extraFields);

  const existing = await getUserProfile(supabaseUserId);
  if (existing && !extraFields) return existing;

  const patch: Record<string, unknown> = {
    id: supabaseUserId,
    // Always kept in sync with the live Firebase session, same as
    // ensureLinkedSupabaseProfile in authService.ts — this is the one
    // column getSupabaseUserId() checks to bridge Firebase -> Supabase
    // identity for every customer-data query. Never omit it: a row
    // that exists but has the wrong (or no) firebase_uid makes every
    // subsequent booking/patient/address/report lookup for this
    // account silently resolve to nothing.
    firebase_uid: user.uid,
    ...(user.email ? { email: user.email } : {}),
    ...(!existing && user.displayName ? { name: user.displayName } : {}),
    ...(!existing && user.phoneNumber ? { phone: user.phoneNumber } : {}),
    ...(!existing && user.photoURL ? { photo_url: user.photoURL } : {}),
    // Explicit signup-form values win over whatever Firebase itself
    // carried (a Google account's displayName, for instance).
    ...(extraFields?.name ? { name: extraFields.name } : {}),
    ...(extraFields?.phone ? { phone: extraFields.phone } : {}),
  };
  const { data, error } = await getSupabaseClient().from("profiles").upsert(patch, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return rowToProfile(data);
}

export async function updateUserProfile(supabaseUserId: string, data: Partial<UserProfile>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.email !== undefined) patch.email = data.email;
  if (data.photoUrl !== undefined) patch.photo_url = data.photoUrl;
  if (data.dateOfBirth !== undefined) patch.date_of_birth = data.dateOfBirth;
  if (data.gender !== undefined) patch.gender = data.gender;
  const { error } = await getSupabaseClient().from("profiles").update(patch).eq("id", supabaseUserId);
  if (error) throw error;
}
