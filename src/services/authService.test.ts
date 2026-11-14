// Supabase Auth is now the only runtime path for Google and email/
// password — this proves authService's own contract for each, not
// whether Supabase itself works (mocked; a real OAuth redirect can't
// run headless). Firebase is mocked too, purely for the phone-OTP
// re-exports and logout's dual sign-out.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/firebase/auth", () => ({
  createRecaptchaVerifier: vi.fn(),
  sendOtp: vi.fn(),
  confirmOtp: vi.fn(),
  signOutUser: vi.fn(),
}));
vi.mock("@/services/userService", () => ({
  ensureUserProfile: vi.fn().mockResolvedValue({ id: "supa-uuid-1" }),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/supabase/auth", () => ({
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  resetPassword: vi.fn(),
  updateUserPassword: vi.fn(),
  signOutUser: vi.fn(),
}));

const firebaseAuth = await import("@/firebase/auth");
const supabaseAuth = await import("@/supabase/auth");
const userService = await import("@/services/userService");
const authService = await import("./authService");

const FAKE_SUPABASE_USER = {
  id: "supa-uuid-1",
  email: "customer@example.invalid",
  phone: null,
  user_metadata: { full_name: "Asha Verma" },
};

afterEach(() => vi.clearAllMocks());

describe("loginWithGoogle", () => {
  it("kicks off the Supabase redirect and resolves without a user (there is none yet)", async () => {
    vi.mocked(supabaseAuth.signInWithGoogle).mockResolvedValue(undefined);
    await expect(authService.loginWithGoogle("https://metrohealthlab.in/dashboard")).resolves.toBeUndefined();
    expect(supabaseAuth.signInWithGoogle).toHaveBeenCalledWith("https://metrohealthlab.in/dashboard");
  });

  it("propagates a real configuration/network failure", async () => {
    vi.mocked(supabaseAuth.signInWithGoogle).mockRejectedValue(new Error("provider not enabled"));
    await expect(authService.loginWithGoogle()).rejects.toThrow("provider not enabled");
  });
});

describe("loginWithEmail", () => {
  it("returns a normalized AppUser built from the Supabase user", async () => {
    vi.mocked(supabaseAuth.signInWithEmail).mockResolvedValue(FAKE_SUPABASE_USER as never);
    const user = await authService.loginWithEmail("customer@example.invalid", "correct-password");
    expect(user).toMatchObject({ uid: "supa-uuid-1", email: "customer@example.invalid", provider: "supabase" });
  });

  it("propagates a wrong-password rejection", async () => {
    vi.mocked(supabaseAuth.signInWithEmail).mockRejectedValue(new Error("invalid credentials"));
    await expect(authService.loginWithEmail("customer@example.invalid", "wrong")).rejects.toThrow("invalid credentials");
  });
});

describe("registerAndLoginWithEmail", () => {
  it("upserts the profile with the signup form's extra fields and returns the new user", async () => {
    vi.mocked(supabaseAuth.registerWithEmail).mockResolvedValue({
      user: FAKE_SUPABASE_USER,
      session: { access_token: "t" },
    } as never);

    const user = await authService.registerAndLoginWithEmail("customer@example.invalid", "pw123456", {
      name: "Asha Verma",
      phone: "+919990001111",
    });

    expect(user).toMatchObject({ uid: "supa-uuid-1", provider: "supabase" });
    expect(userService.ensureUserProfile).toHaveBeenCalledWith(
      "supa-uuid-1",
      expect.objectContaining({ uid: "supa-uuid-1" }),
      { name: "Asha Verma", phone: "+919990001111" }
    );
  });

  // Real, expected outcome when the Supabase project requires email
  // confirmation — the account IS created, there is just no session to
  // act on yet. Must never be reported as a failure.
  it("returns null (not a thrown error) when Supabase requires email confirmation", async () => {
    vi.mocked(supabaseAuth.registerWithEmail).mockResolvedValue({ user: FAKE_SUPABASE_USER, session: null } as never);
    const user = await authService.registerAndLoginWithEmail("new@example.invalid", "pw123456");
    expect(user).toBeNull();
    expect(userService.ensureUserProfile).not.toHaveBeenCalled();
  });
});

describe("logout: clears both sessions", () => {
  it("calls both Firebase and Supabase sign-out, and never throws even if both fail", async () => {
    vi.mocked(firebaseAuth.signOutUser).mockRejectedValue(new Error("firebase network blip"));
    vi.mocked(supabaseAuth.signOutUser).mockRejectedValue(new Error("supabase network blip"));

    await expect(authService.logout()).resolves.toBeUndefined();
    expect(firebaseAuth.signOutUser).toHaveBeenCalledOnce();
    expect(supabaseAuth.signOutUser).toHaveBeenCalledOnce();
  });

  it("resolves cleanly when both succeed", async () => {
    vi.mocked(firebaseAuth.signOutUser).mockResolvedValue(undefined);
    vi.mocked(supabaseAuth.signOutUser).mockResolvedValue(undefined);
    await expect(authService.logout()).resolves.toBeUndefined();
  });
});
