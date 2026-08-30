// Proves the one safety property the whole dual-provider design rests
// on: a Supabase failure must NEVER block, delay past its own error, or
// fail a Firebase-based sign-in. Firestore access — the thing that
// actually works today — depends only on Firebase succeeding; Supabase
// linking is authorization-only and strictly best-effort.
//
// Firebase calls are mocked (a real popup can't run headless); the
// property under test is authService's own error-containment logic,
// not whether Firebase itself works.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/firebase/auth", () => ({
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  resetPassword: vi.fn(),
  createRecaptchaVerifier: vi.fn(),
  sendOtp: vi.fn(),
  confirmOtp: vi.fn(),
  signOutUser: vi.fn(),
}));
vi.mock("@/services/userService", () => ({
  ensureUserProfile: vi.fn().mockResolvedValue({ id: "fb-uid-1" }),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/supabase/auth", () => ({
  signInWithEmail: vi.fn(),
  signInWithGoogleIdToken: vi.fn(),
  registerWithEmail: vi.fn(),
  signOutUser: vi.fn(),
}));
vi.mock("@/supabase/client", () => ({
  getSupabaseClient: vi.fn(() => ({ from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }) })),
}));

const firebaseAuth = await import("@/firebase/auth");
const supabaseAuth = await import("@/supabase/auth");
const authService = await import("./authService");

const FAKE_FIREBASE_USER = { uid: "fb-uid-1", email: "customer@example.invalid" };

afterEach(() => vi.clearAllMocks());

describe("loginWithGoogle: Supabase linking is best-effort", () => {
  it("returns the Firebase user even when the Supabase link fails", async () => {
    vi.mocked(firebaseAuth.signInWithGoogle).mockResolvedValue({
      user: FAKE_FIREBASE_USER,
      googleIdToken: "fake-id-token",
    } as never);
    vi.mocked(supabaseAuth.signInWithGoogleIdToken).mockRejectedValue(new Error("supabase is down"));

    const user = await authService.loginWithGoogle();
    expect(user).toBe(FAKE_FIREBASE_USER);
  });

  it("returns the Firebase user even when Firebase gave no Google ID token at all", async () => {
    vi.mocked(firebaseAuth.signInWithGoogle).mockResolvedValue({
      user: FAKE_FIREBASE_USER,
      googleIdToken: null,
    } as never);

    const user = await authService.loginWithGoogle();
    expect(user).toBe(FAKE_FIREBASE_USER);
    expect(supabaseAuth.signInWithGoogleIdToken).not.toHaveBeenCalled();
  });

  it("still throws when FIREBASE itself fails — that failure is real, not swallowed", async () => {
    vi.mocked(firebaseAuth.signInWithGoogle).mockRejectedValue(new Error("popup closed by user"));
    await expect(authService.loginWithGoogle()).rejects.toThrow("popup closed by user");
    expect(supabaseAuth.signInWithGoogleIdToken).not.toHaveBeenCalled();
  });
});

describe("loginWithEmail: Supabase linking is best-effort", () => {
  it("returns the Firebase user even when the Supabase password does not match", async () => {
    vi.mocked(firebaseAuth.signInWithEmail).mockResolvedValue(FAKE_FIREBASE_USER as never);
    vi.mocked(supabaseAuth.signInWithEmail).mockRejectedValue(new Error("invalid credentials"));

    const user = await authService.loginWithEmail("customer@example.invalid", "correct-firebase-password");
    expect(user).toBe(FAKE_FIREBASE_USER);
  });

  it("never even attempts Supabase when Firebase rejects the password", async () => {
    vi.mocked(firebaseAuth.signInWithEmail).mockRejectedValue(new Error("wrong password"));
    await expect(authService.loginWithEmail("customer@example.invalid", "wrong")).rejects.toThrow("wrong password");
    expect(supabaseAuth.signInWithEmail).not.toHaveBeenCalled();
  });
});

describe("logout: clears both sessions", () => {
  it("calls both Firebase and Supabase sign-out, and does not throw if Supabase's fails", async () => {
    vi.mocked(firebaseAuth.signOutUser).mockResolvedValue(undefined);
    vi.mocked(supabaseAuth.signOutUser).mockRejectedValue(new Error("network blip"));

    await expect(authService.logout()).resolves.toBeUndefined();
    expect(firebaseAuth.signOutUser).toHaveBeenCalledOnce();
    expect(supabaseAuth.signOutUser).toHaveBeenCalledOnce();
  });

  it("propagates a FIREBASE sign-out failure — ending the real session is not optional", async () => {
    vi.mocked(firebaseAuth.signOutUser).mockRejectedValue(new Error("firebase sign-out failed"));
    vi.mocked(supabaseAuth.signOutUser).mockResolvedValue(undefined);
    await expect(authService.logout()).rejects.toThrow("firebase sign-out failed");
  });
});
