import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/types/authUser";

// Regression coverage for the signup race: registerAndLoginWithEmail
// used to write name/phone via a SEPARATE call after ensureUserProfile()
// had already run — racing against AuthProvider's own concurrent
// ensureUserProfile() call for the very same sign-in. The fix: extra
// fields are written in the SAME upserting call, and the upsert never
// clears a column it doesn't mention, so ordering between the two
// concurrent callers can never lose data. Preserved here across two
// storage migrations (Firestore -> Supabase profiles, then Firebase-
// bridged -> Supabase-native identity) since the race itself is about
// call ordering, not which database or identity model is behind it.
const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: state.rows.get(id) ?? null, error: null }),
          }),
        }),
        upsert: (patch: Record<string, unknown>) => {
          const id = patch.id as string;
          const merged = { ...(state.rows.get(id) ?? {}), ...patch };
          state.rows.set(id, merged);
          return {
            select: () => ({
              single: async () => ({ data: merged, error: null }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            state.rows.set(id, { ...(state.rows.get(id) ?? {}), ...patch });
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const { ensureUserProfile, getUserProfile, updateUserProfile } = await import("@/services/userService");

const SUPABASE_ID = "11111111-1111-1111-1111-111111111111";
// A Supabase-native account's uid IS its Supabase id — no separate
// Firebase identity exists for this account at all under the current
// auth architecture.
const SUPABASE_USER: AppUser = {
  uid: SUPABASE_ID,
  email: "customer@example.invalid",
  displayName: null,
  phoneNumber: null,
  photoURL: null,
  provider: "supabase",
};

beforeEach(() => {
  state.rows.clear();
});

describe("ensureUserProfile", () => {
  it("creates a fresh profile with the extra signup fields in the SAME write, not a follow-up update", async () => {
    const profile = await ensureUserProfile(SUPABASE_ID, SUPABASE_USER, { name: "Asha Verma", phone: "+919990001111" });
    expect(profile.name).toBe("Asha Verma");
    expect(profile.phone).toBe("+919990001111");
    expect(state.rows.get(SUPABASE_ID)).toMatchObject({ name: "Asha Verma", phone: "+919990001111" });
  });

  it("regression: AuthProvider's own concurrent call (no extra fields) landing AFTER signup's call does not erase name/phone", async () => {
    // Signup's call lands first, with the form fields.
    await ensureUserProfile(SUPABASE_ID, SUPABASE_USER, { name: "Asha Verma", phone: "+919990001111" });
    // AuthProvider's own onAuthStateChanged handler fires moments later
    // for the same sign-in, with no extra fields at all.
    const second = await ensureUserProfile(SUPABASE_ID, SUPABASE_USER);
    expect(second.name).toBe("Asha Verma");
    expect(second.phone).toBe("+919990001111");
  });

  it("regression: the reverse order — AuthProvider's plain call landing FIRST — still lets signup's fields land safely", async () => {
    // AuthProvider's call creates the bare row first (this is the
    // ordering that used to throw "not-found" from the old Firestore
    // updateDoc-based design).
    await ensureUserProfile(SUPABASE_ID, SUPABASE_USER);
    const second = await ensureUserProfile(SUPABASE_ID, SUPABASE_USER, { name: "Asha Verma", phone: "+919990001111" });
    expect(second.name).toBe("Asha Verma");
    expect(second.phone).toBe("+919990001111");
  });

  it("returns the existing profile without a write when called again with no extra fields", async () => {
    await ensureUserProfile(SUPABASE_ID, SUPABASE_USER, { name: "Asha Verma" });
    const again = await ensureUserProfile(SUPABASE_ID, SUPABASE_USER);
    expect(again.name).toBe("Asha Verma");
  });

  it("uses the Supabase uuid as the row id", async () => {
    await ensureUserProfile(SUPABASE_ID, SUPABASE_USER);
    expect(state.rows.has(SUPABASE_ID)).toBe(true);
  });

  // Regression, the OTHER direction from earlier this project: once
  // Supabase Auth became the only identity for email/Google accounts,
  // there is no separate Firebase uid to bridge to at all — writing one
  // into this column for a brand new account would be actively wrong
  // (it would hold a Supabase uuid pretending to be a Firebase uid).
  // The column may still hold a value for accounts migrated before this
  // architecture changed; nothing here should ever populate it again.
  it("never writes a firebase_uid column — there is no Firebase identity to bridge any more", async () => {
    await ensureUserProfile(SUPABASE_ID, SUPABASE_USER, { name: "Asha Verma" });
    expect("firebase_uid" in (state.rows.get(SUPABASE_ID) ?? {})).toBe(false);
  });

  // Phone-only sign-in: no Supabase session exists, so there is no
  // profiles row this account could own. Must still return a usable
  // view built from the live Firebase user, not null or a throw.
  it("falls back to a live, unpersisted profile when there is no linked Supabase session", async () => {
    const phoneUser: AppUser = {
      uid: "fb-phone-1",
      email: null,
      displayName: "Rahul",
      phoneNumber: "+919990002222",
      photoURL: null,
      provider: "firebase-phone",
    };
    const profile = await ensureUserProfile(null, phoneUser);
    expect(profile.name).toBe("Rahul");
    expect(profile.phone).toBe("+919990002222");
    expect(profile.id).toBe("fb-phone-1");
    // Nothing was written anywhere — there is no row to check for.
    expect(state.rows.size).toBe(0);
  });

  it("still honours extra signup fields for a phone-only fallback profile", async () => {
    const phoneUser: AppUser = {
      uid: "fb-phone-2",
      email: null,
      displayName: null,
      phoneNumber: "+919990003333",
      photoURL: null,
      provider: "firebase-phone",
    };
    const profile = await ensureUserProfile(null, phoneUser, { name: "Walk-in Customer" });
    expect(profile.name).toBe("Walk-in Customer");
  });
});

describe("getUserProfile / updateUserProfile", () => {
  it("reads back a profile by its Supabase id", async () => {
    state.rows.set(SUPABASE_ID, { id: SUPABASE_ID, name: "Asha Verma", email: "asha@example.invalid" });
    const profile = await getUserProfile(SUPABASE_ID);
    expect(profile?.name).toBe("Asha Verma");
  });

  it("returns null for a profile that does not exist", async () => {
    expect(await getUserProfile(SUPABASE_ID)).toBeNull();
  });

  it("updates only the fields provided, leaving the rest of the row alone", async () => {
    state.rows.set(SUPABASE_ID, { id: SUPABASE_ID, name: "Old Name", phone: "+919990001111" });
    await updateUserProfile(SUPABASE_ID, { name: "New Name" });
    expect(state.rows.get(SUPABASE_ID)).toMatchObject({ name: "New Name", phone: "+919990001111" });
  });
});
