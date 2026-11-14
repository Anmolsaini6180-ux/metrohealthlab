import { describe, expect, it, vi } from "vitest";
import { resolvePhoneBridgeTarget, bridgePhoneSession } from "./phoneBridge";

describe("resolvePhoneBridgeTarget (phone-auth bridge decision)", () => {
  it("attaches to an existing profile matched by firebase_uid", () => {
    const result = resolvePhoneBridgeTarget({
      firebaseUid: "fb-1",
      phone: "+919990000000",
      profilesByFirebaseUid: new Map([["fb-1", "profile-a"]]),
      profilesByPhone: new Map(),
    });
    expect(result).toEqual({ action: "attach-existing", profileId: "profile-a", matchedBy: "firebase_uid" });
  });

  it("falls back to phone when firebase_uid is unknown", () => {
    const result = resolvePhoneBridgeTarget({
      firebaseUid: "brand-new-uid",
      phone: "+919990000001",
      profilesByFirebaseUid: new Map(),
      profilesByPhone: new Map([["+919990000001", "profile-b"]]),
    });
    expect(result).toEqual({ action: "attach-existing", profileId: "profile-b", matchedBy: "phone" });
  });

  it("prefers firebase_uid over a conflicting phone match, since carriers reassign numbers", () => {
    const result = resolvePhoneBridgeTarget({
      firebaseUid: "fb-1",
      phone: "+919990000002",
      profilesByFirebaseUid: new Map([["fb-1", "profile-correct"]]),
      profilesByPhone: new Map([["+919990000002", "profile-wrong-previous-owner"]]),
    });
    expect(result.profileId).toBe("profile-correct");
  });

  it("creates new only when neither firebase_uid nor phone is known — never forks an existing account", () => {
    const result = resolvePhoneBridgeTarget({
      firebaseUid: "never-seen",
      phone: "+919990000003",
      profilesByFirebaseUid: new Map(),
      profilesByPhone: new Map(),
    });
    expect(result).toEqual({ action: "create-new", profileId: null, matchedBy: null });
  });
});

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: invokeMock } }),
}));

describe("bridgePhoneSession (real Edge Function exchange)", () => {
  it("sends the raw id token and returns the session on success — never anything else from the response", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { accessToken: "real-access-token", refreshToken: "real-refresh-token" },
      error: null,
    });

    const result = await bridgePhoneSession("a-real-firebase-id-token");

    expect(invokeMock).toHaveBeenCalledWith("bridge-phone-session", { body: { firebaseIdToken: "a-real-firebase-id-token" } });
    expect(result).toEqual({ accessToken: "real-access-token", refreshToken: "real-refresh-token" });
  });

  it("surfaces the Edge Function's own safe error message rather than supabase-js's generic wrapper text", async () => {
    const response = new Response(JSON.stringify({ error: "We found more than one account matching this phone number." }), {
      status: 409,
    });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: response },
    });

    await expect(bridgePhoneSession("some-token")).rejects.toThrow(/more than one account/);
  });

  it("falls back to a generic message when the error response has no parseable body", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network error" },
    });

    await expect(bridgePhoneSession("some-token")).rejects.toThrow(/Could not verify your phone sign-in/);
  });

  it("throws rather than returning a partial result if the response is missing a token", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { accessToken: "only-half-a-session" },
      error: null,
    });

    await expect(bridgePhoneSession("some-token")).rejects.toThrow(/Could not verify your phone sign-in/);
  });
});
