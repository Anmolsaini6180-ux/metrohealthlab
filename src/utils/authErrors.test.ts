import { describe, expect, it } from "vitest";
import { describeSignInError, firebaseErrorCode } from "./authErrors";

// A Firebase error is a plain Error with a `code`.
function fbError(code: string): Error {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

describe("reading a Firebase error code", () => {
  it("pulls the code out of a Firebase error", () => {
    expect(firebaseErrorCode(fbError("auth/popup-blocked"))).toBe("auth/popup-blocked");
  });

  it("returns an empty string for anything that isn't one", () => {
    expect(firebaseErrorCode(new Error("boom"))).toBe("");
    expect(firebaseErrorCode(null)).toBe("");
    expect(firebaseErrorCode(undefined)).toBe("");
    expect(firebaseErrorCode("auth/popup-blocked")).toBe("");
    expect(firebaseErrorCode({ code: 42 })).toBe("");
  });
});

describe("telling the sign-in failure modes apart", () => {
  // The whole point of the module: these must NOT collapse together.
  const cases: Array<[string, string]> = [
    ["auth/popup-closed-by-user", "popup-cancelled"],
    ["auth/cancelled-popup-request", "popup-cancelled"],
    ["auth/popup-blocked", "popup-blocked"],
    ["auth/unauthorized-domain", "unauthorized-domain"],
    ["auth/operation-not-allowed", "provider-config"],
    ["auth/configuration-not-found", "provider-config"],
    ["auth/invalid-credential", "invalid-credentials"],
    ["auth/wrong-password", "invalid-credentials"],
    ["auth/network-request-failed", "network"],
    ["unavailable", "unavailable"],
    ["permission-denied", "permission-denied"],
    ["unauthenticated", "permission-denied"],
  ];

  for (const [code, failure] of cases) {
    it(`maps ${code} to ${failure}`, () => {
      expect(describeSignInError(fbError(code)).failure).toBe(failure);
    });
  }

  it("falls back to a generic failure for an unrecognised error", () => {
    const info = describeSignInError(new Error("something odd"));
    expect(info.failure).toBe("unknown");
    expect(info.code).toBe("unknown");
    expect(info.silent).toBe(false);
  });

  it("stays silent only when the user cancelled it themselves", () => {
    expect(describeSignInError(fbError("auth/popup-closed-by-user")).silent).toBe(true);
    expect(describeSignInError(fbError("auth/popup-blocked")).silent).toBe(false);
    expect(describeSignInError(fbError("permission-denied")).silent).toBe(false);
  });

  it("every mapped failure carries a non-empty, user-safe message", () => {
    for (const [code] of cases) {
      const info = describeSignInError(fbError(code));
      expect(info.message.length).toBeGreaterThan(0);
      expect(info.code).toBe(code);
    }
  });

  it("a permission-denied role lookup is never described as 'not an admin'", () => {
    // Reporting a rules/transport failure as an authorization verdict
    // is the exact confusion this module exists to prevent.
    expect(describeSignInError(fbError("permission-denied")).message).not.toMatch(/authorized/i);
  });
});
