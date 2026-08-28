import { describe, expect, it } from "vitest";
import {
  CALLABLE_UNAVAILABLE_MESSAGE,
  firebaseErrorCode,
  isCallableUnavailable,
  toUserMessage,
} from "@/utils/errors";

// Mirrors a FirebaseError: an Error subclass carrying a `code`, whose
// `message` is frequently just the code itself.
class FakeFirebaseError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "FirebaseError";
  }
}

describe("firebaseErrorCode", () => {
  it("reads the code off a FirebaseError", () => {
    expect(firebaseErrorCode(new FakeFirebaseError("permission-denied"))).toBe("permission-denied");
  });

  it("returns null for anything without one", () => {
    expect(firebaseErrorCode(new Error("boom"))).toBeNull();
    expect(firebaseErrorCode("boom")).toBeNull();
    expect(firebaseErrorCode(null)).toBeNull();
    expect(firebaseErrorCode(undefined)).toBeNull();
  });
});

describe("isCallableUnavailable", () => {
  // The whole Cloud Functions tree is undeployed on this project, so an
  // unreachable callable is the expected outcome, not a freak error.
  it("recognises an unreachable callable", () => {
    expect(isCallableUnavailable(new FakeFirebaseError("functions/internal", "internal"))).toBe(true);
    expect(isCallableUnavailable(new FakeFirebaseError("functions/not-found"))).toBe(true);
    expect(isCallableUnavailable(new FakeFirebaseError("functions/unavailable"))).toBe(true);
  });

  it("does not mistake a Firestore error for one", () => {
    expect(isCallableUnavailable(new FakeFirebaseError("permission-denied"))).toBe(false);
    expect(isCallableUnavailable(new FakeFirebaseError("unavailable"))).toBe(false);
    expect(isCallableUnavailable(new Error("internal"))).toBe(false);
  });

  it("does not swallow a genuine callable rejection", () => {
    // permission-denied from a deployed function is a real answer, not
    // a deployment problem.
    expect(isCallableUnavailable(new FakeFirebaseError("functions/permission-denied"))).toBe(false);
  });
});

describe("toUserMessage", () => {
  // This is the exact regression: the Dashboard rendered the word
  // "internal" because that was the FirebaseError's whole message.
  it("never surfaces a bare Firebase code as the message", () => {
    const message = toUserMessage(new FakeFirebaseError("functions/internal", "internal"));
    expect(message).toBe(CALLABLE_UNAVAILABLE_MESSAGE);
    expect(message).not.toBe("internal");
  });

  it("explains a permission failure in terms an operator can act on", () => {
    expect(toUserMessage(new FakeFirebaseError("permission-denied"))).toMatch(/permission/i);
  });

  it("maps the common Firestore codes", () => {
    expect(toUserMessage(new FakeFirebaseError("unauthenticated"))).toMatch(/sign in/i);
    expect(toUserMessage(new FakeFirebaseError("not-found"))).toMatch(/no longer exists/i);
    expect(toUserMessage(new FakeFirebaseError("unavailable"))).toMatch(/connection/i);
    expect(toUserMessage(new FakeFirebaseError("invalid-argument"))).toMatch(/not valid/i);
  });

  it("keeps a real human-written message", () => {
    expect(toUserMessage(new Error("That file is too large (max 10 MB)."))).toBe("That file is too large (max 10 MB).");
  });

  it("rejects a lowercase-code-shaped message even without a code", () => {
    // "internal" / "aborted" style strings are codes, not sentences.
    expect(toUserMessage(new Error("internal"))).not.toBe("internal");
  });

  it("still says something useful for a non-Error value", () => {
    expect(toUserMessage("nope")).toMatch(/something went wrong/i);
    expect(toUserMessage(undefined)).toMatch(/something went wrong/i);
  });

  it("names an unmapped code so the operator can search for it", () => {
    expect(toUserMessage(new FakeFirebaseError("some-new-code"))).toContain("some-new-code");
  });
});
