import { describe, expect, it } from "vitest";
import { describeSignInError } from "./authErrors";

// A Supabase AuthApiError is a plain Error with a `.code` (and always
// a `.message`, used as the fallback-matching path when `.code` isn't
// present at all — an older edge case or a bare network failure).
function supaError(code: string, message = `${code} error`): Error {
  return Object.assign(new Error(message), { code });
}

describe("telling the sign-in failure modes apart", () => {
  // The whole point of the module: these must NOT collapse together.
  const cases: Array<[string, string]> = [
    ["invalid_credentials", "invalid-credentials"],
    ["invalid_grant", "invalid-credentials"],
    ["email_not_confirmed", "email-not-confirmed"],
    ["user_not_found", "invalid-credentials"],
    ["user_banned", "invalid-credentials"],
    ["over_request_rate_limit", "rate-limited"],
    ["over_email_send_rate_limit", "rate-limited"],
    ["provider_disabled", "provider-config"],
  ];

  for (const [code, failure] of cases) {
    it(`maps ${code} to ${failure}`, () => {
      expect(describeSignInError(supaError(code)).failure).toBe(failure);
    });
  }

  it("falls back to a generic failure for an unrecognised error", () => {
    const info = describeSignInError(new Error("something odd"));
    expect(info.failure).toBe("unknown");
    expect(info.code).toBe("unknown");
    expect(info.silent).toBe(false);
  });

  it("matches by message when there is no stable .code at all", () => {
    expect(describeSignInError(new Error("Invalid login credentials")).failure).toBe("invalid-credentials");
    expect(describeSignInError(new Error("Failed to fetch")).failure).toBe("network");
    expect(describeSignInError(new Error("popup was closed by the user")).failure).toBe("cancelled");
  });

  it("stays silent only when the user cancelled it themselves", () => {
    expect(describeSignInError(new Error("the popup was closed")).silent).toBe(true);
    expect(describeSignInError(supaError("invalid_credentials")).silent).toBe(false);
    expect(describeSignInError(new Error("row-level security policy denied")).silent).toBe(false);
  });

  it("every mapped failure carries a non-empty, user-safe message", () => {
    for (const [code] of cases) {
      const info = describeSignInError(supaError(code));
      expect(info.message.length).toBeGreaterThan(0);
      expect(info.code).toBe(code);
    }
  });

  it("a permission-denied role lookup is never described as 'not an admin'", () => {
    // Reporting an RLS/transport failure as an authorization verdict is
    // the exact confusion this module exists to prevent.
    const info = describeSignInError(new Error("permission denied for table staff_roles"));
    expect(info.failure).toBe("permission-denied");
    expect(info.message).not.toMatch(/authorized/i);
  });
});
