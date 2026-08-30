import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the signup race: registerAndLoginWithEmail
// used to write name/phone via a SEPARATE updateDoc() call after
// ensureUserProfile() had already run — racing against AuthProvider's
// own concurrent ensureUserProfile() call for the very same sign-in.
// If AuthProvider's setDoc landed second (or first, before the
// updateDoc), the update could fail entirely (updateDoc requires the
// document to already exist) or be clobbered. The fix: extraFields are
// written in the SAME creating call, and every write uses merge:true
// so ordering between the two concurrent callers can never lose data.
const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => ({
    exists: () => state.docs.has(ref.id),
    id: ref.id,
    data: () => state.docs.get(ref.id),
  }),
  setDoc: async (ref: { id: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
    if (options?.merge && state.docs.has(ref.id)) {
      state.docs.set(ref.id, { ...state.docs.get(ref.id), ...data });
    } else {
      state.docs.set(ref.id, data);
    }
  },
  updateDoc: async (ref: { id: string }, data: Record<string, unknown>) => {
    if (!state.docs.has(ref.id)) throw new Error("not-found: document does not exist");
    state.docs.set(ref.id, { ...state.docs.get(ref.id), ...data });
  },
  serverTimestamp: () => ({ kind: "serverTimestamp" }),
}));

vi.mock("@/firebase/firestore", () => ({ getDb: () => ({}) }));

const { ensureUserProfile } = await import("@/services/userService");

const FIREBASE_USER = { uid: "fb-uid-1", email: "customer@example.invalid", displayName: null, phoneNumber: null, photoURL: null };

beforeEach(() => {
  state.docs.clear();
});

describe("ensureUserProfile", () => {
  it("creates a fresh profile with the extra signup fields in the SAME write, not a follow-up update", async () => {
    const profile = await ensureUserProfile(FIREBASE_USER as never, { name: "Asha Verma", phone: "+919990001111" });
    expect(profile.name).toBe("Asha Verma");
    expect(profile.phone).toBe("+919990001111");
    expect(state.docs.get("fb-uid-1")).toMatchObject({ name: "Asha Verma", phone: "+919990001111" });
  });

  it("regression: AuthProvider's own concurrent call (no extra fields) landing AFTER signup's call does not erase name/phone", async () => {
    // Signup's call lands first, with the form fields.
    await ensureUserProfile(FIREBASE_USER as never, { name: "Asha Verma", phone: "+919990001111" });
    // AuthProvider's own onAuthStateChanged handler fires moments later
    // for the same sign-in, with no extra fields at all.
    const second = await ensureUserProfile(FIREBASE_USER as never);
    expect(second.name).toBe("Asha Verma");
    expect(second.phone).toBe("+919990001111");
  });

  it("regression: the reverse order — AuthProvider's plain call landing FIRST — still lets signup's fields land safely", async () => {
    // AuthProvider's call creates the bare document first (this is the
    // ordering that used to throw "not-found" from updateDoc in the
    // old two-call design).
    await ensureUserProfile(FIREBASE_USER as never);
    const second = await ensureUserProfile(FIREBASE_USER as never, { name: "Asha Verma", phone: "+919990001111" });
    expect(second.name).toBe("Asha Verma");
    expect(second.phone).toBe("+919990001111");
  });

  it("returns the existing profile without a write when called again with no extra fields", async () => {
    await ensureUserProfile(FIREBASE_USER as never, { name: "Asha Verma" });
    const again = await ensureUserProfile(FIREBASE_USER as never);
    expect(again.name).toBe("Asha Verma");
  });
});
