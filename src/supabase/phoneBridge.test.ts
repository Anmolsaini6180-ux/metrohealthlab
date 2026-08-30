import { describe, expect, it } from "vitest";
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

describe("bridgePhoneSession (honest not-yet-implemented boundary)", () => {
  it("throws a clear, specific error rather than silently no-op'ing or faking success", async () => {
    await expect(bridgePhoneSession("some-firebase-id-token")).rejects.toThrow(/Edge Function/);
  });
});
