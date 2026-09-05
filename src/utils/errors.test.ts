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

// Mirrors @supabase/postgrest-js's real PostgrestError shape: an Error
// subclass whose `.code` is a Postgres SQLSTATE or a "PGRSTnnn" code,
// and whose `.message` is the database's own human-readable wording.
class FakePostgrestError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PostgrestError";
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

describe("toUserMessage with Supabase/PostgREST errors", () => {
  // The exact regression this covers: PostgrestError extends Error, so
  // without dedicated handling it fell through to the "keep a real
  // message" branch and leaked Postgres's own engine wording — table,
  // column, and policy names — straight to the customer screen.
  it("never surfaces a raw row-level-security denial", () => {
    const message = toUserMessage(
      new FakePostgrestError("42501", 'new row violates row-level security policy for table "bookings"')
    );
    expect(message).toBe("You do not have permission to do that.");
    expect(message).not.toMatch(/relation|policy|"bookings"/);
  });

  it("never surfaces a raw not-null constraint violation", () => {
    const message = toUserMessage(
      new FakePostgrestError("23502", 'null value in column "phone" of relation "bookings" violates not-null constraint')
    );
    expect(message).toMatch(/required information is missing/i);
    expect(message).not.toMatch(/column|relation|"phone"|"bookings"/);
  });

  it("never surfaces a raw PostgREST embedding-ambiguity error", () => {
    const message = toUserMessage(
      new FakePostgrestError(
        "PGRST201",
        "Could not embed because more than one relationship was found for 'staff_roles' and 'profiles'"
      )
    );
    expect(message).not.toMatch(/embed|relationship|staff_roles/);
  });

  it("never surfaces a raw unique-constraint violation", () => {
    const message = toUserMessage(
      new FakePostgrestError("23505", 'duplicate key value violates unique constraint "media_assets_pkey"')
    );
    expect(message).toBe("That already exists.");
  });

  it("still shows this app's own hand-written RPC exception text", () => {
    // A SECURITY DEFINER function's `raise exception '<sentence>' using
    // errcode = '42501'` is authored specifically to be shown — it must
    // not be swallowed just because it happens to share a code with a
    // raw engine denial.
    const message = toUserMessage(new FakePostgrestError("42501", "You cannot change your own role or access."));
    expect(message).toBe("You cannot change your own role or access.");
  });

  it("still shows a custom P0002 exception from an RPC", () => {
    const message = toUserMessage(
      new FakePostgrestError(
        "P0002",
        "No account has signed in with that email address yet. Ask them to sign in once (Google or email/password), then grant the role."
      )
    );
    expect(message).toMatch(/no account has signed in/i);
  });

  it("falls back to a generic message for an unmapped Postgres code with raw wording", () => {
    const message = toUserMessage(new FakePostgrestError("42883", "operator does not exist: uuid = text"));
    expect(message).toBe("Something went wrong. Please try again.");
  });
});
