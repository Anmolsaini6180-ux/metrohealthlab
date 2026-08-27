import { describe, it, expect } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";
import {
  buildOwnershipChain,
  canAssignRole,
  isAdminRole,
  normalizeEmail,
  requireStaff,
  CREATABLE_ROLES,
  type AdminRole,
} from "./roleClaims";
import { isMasterAdminEmail } from "./masterAdmin";
import { assertValidStaffEmail } from "./staffRoles";

// Mirrors how a real signed ID token carries claims: role lives on
// request.auth.token (set by the Admin SDK), never in request.data.
function req(token?: Record<string, unknown>, uid?: string, data?: unknown): CallableRequest<unknown> {
  return {
    auth: uid ? { uid, token: (token ?? {}) as never } : undefined,
    data: data ?? {},
    rawRequest: {} as never,
    acceptsStreaming: false,
  } as unknown as CallableRequest<unknown>;
}

const MASTER = "owner@example.com";

describe("master admin authorization", () => {
  it("matches the configured master admin email exactly", () => {
    expect(isMasterAdminEmail(MASTER, MASTER)).toBe(true);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    expect(isMasterAdminEmail("  Owner@Example.COM ", MASTER)).toBe(true);
    expect(isMasterAdminEmail(MASTER, " OWNER@example.com")).toBe(true);
  });

  it("denies every other email, including near-misses", () => {
    expect(isMasterAdminEmail("owner@example.co", MASTER)).toBe(false);
    expect(isMasterAdminEmail("owner@example.com.attacker.test", MASTER)).toBe(false);
    expect(isMasterAdminEmail("attacker+owner@example.com", MASTER)).toBe(false);
    expect(isMasterAdminEmail("owner@examplE.com\n", MASTER)).toBe(true); // trim() covers newline
  });

  it("never treats a missing or non-string email as the master admin", () => {
    // The important case: an account with no email on its token must
    // not fall through to a truthy comparison.
    expect(isMasterAdminEmail(undefined, MASTER)).toBe(false);
    expect(isMasterAdminEmail(null, MASTER)).toBe(false);
    expect(isMasterAdminEmail("", MASTER)).toBe(false);
    expect(isMasterAdminEmail({}, MASTER)).toBe(false);
    expect(isMasterAdminEmail(MASTER, "")).toBe(false);
    expect(isMasterAdminEmail("", "")).toBe(false);
  });
});

describe("normal customers are denied admin access", () => {
  it("rejects a signed-in customer with no role claim from staff endpoints", () => {
    expect(() => requireStaff(req({ email: "customer@example.com" }, "uid-cust"))).toThrowError(/authorized/i);
  });

  it("rejects an unauthenticated caller", () => {
    expect(() => requireStaff(req())).toThrowError(/signed in/i);
  });

  it("ignores a role a client tries to smuggle in through the request body", () => {
    const request = req({ email: "customer@example.com" }, "uid-cust", {
      role: "SUPER_ADMIN",
      email: "customer@example.com",
    });
    expect(() => requireStaff(request)).toThrowError(/authorized/i);
  });

  it("rejects a role-shaped claim that isn't one of the four real roles", () => {
    expect(isAdminRole("OWNER")).toBe(false);
    expect(isAdminRole("super_admin")).toBe(false);
    expect(() => requireStaff(req({ role: "OWNER" }, "uid-x"))).toThrowError(/authorized/i);
  });

  it("accepts each of the four real staff roles", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"] as AdminRole[]) {
      expect(requireStaff(req({ role }, `uid-${role}`)).role).toBe(role);
    }
  });
});

describe("role assignment hierarchy", () => {
  it("never lets anyone assign SUPER_ADMIN — that comes only from MASTER_ADMIN_EMAIL", () => {
    for (const caller of ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"] as AdminRole[]) {
      expect(canAssignRole(caller, "SUPER_ADMIN")).toBe(false);
    }
    expect(CREATABLE_ROLES.SUPER_ADMIN).not.toContain("SUPER_ADMIN");
  });

  it("lets a SUPER_ADMIN assign the three subordinate roles", () => {
    expect(canAssignRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "SUB_ADMIN")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "COLLECTION_AGENT")).toBe(true);
  });

  it("stops an ADMIN promoting anyone to ADMIN or above", () => {
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "SUB_ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "COLLECTION_AGENT")).toBe(true);
  });

  it("limits a SUB_ADMIN to COLLECTION_AGENT only", () => {
    expect(canAssignRole("SUB_ADMIN", "COLLECTION_AGENT")).toBe(true);
    expect(canAssignRole("SUB_ADMIN", "SUB_ADMIN")).toBe(false);
    expect(canAssignRole("SUB_ADMIN", "ADMIN")).toBe(false);
  });

  it("gives a COLLECTION_AGENT no assignment rights at all", () => {
    for (const target of ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"] as AdminRole[]) {
      expect(canAssignRole("COLLECTION_AGENT", target)).toBe(false);
    }
  });

  it("rejects garbage on either side rather than defaulting to allow", () => {
    expect(canAssignRole(undefined, "ADMIN")).toBe(false);
    expect(canAssignRole("SUPER_ADMIN", undefined)).toBe(false);
    expect(canAssignRole("SUPER_ADMIN", "admin")).toBe(false);
    expect(canAssignRole(null, null)).toBe(false);
    expect(canAssignRole({ role: "SUPER_ADMIN" }, "ADMIN")).toBe(false);
  });
});

describe("ownership chain", () => {
  it("stamps a SUPER_ADMIN's uid onto an ADMIN they create", () => {
    expect(buildOwnershipChain("super-1", { role: "SUPER_ADMIN" }, "ADMIN")).toEqual({ superAdminId: "super-1" });
  });

  it("carries every ancestor down to a COLLECTION_AGENT created by a SUB_ADMIN", () => {
    const chain = buildOwnershipChain(
      "sub-1",
      { role: "SUB_ADMIN", superAdminId: "super-1", adminId: "admin-1" },
      "COLLECTION_AGENT"
    );
    expect(chain).toEqual({ superAdminId: "super-1", adminId: "admin-1", subAdminId: "sub-1" });
  });

  it("puts the creating ADMIN in the adminId slot, not the caller's own adminId", () => {
    const chain = buildOwnershipChain("admin-1", { role: "ADMIN", superAdminId: "super-1" }, "SUB_ADMIN");
    expect(chain).toEqual({ superAdminId: "super-1", adminId: "admin-1" });
  });
});

describe("staff email normalization", () => {
  it("lower-cases and trims so one person can't hold two records", () => {
    expect(normalizeEmail("  Staff@Gmail.COM  ")).toBe("staff@gmail.com");
    expect(assertValidStaffEmail(" Staff@Gmail.com ")).toBe("staff@gmail.com");
  });

  it("rejects values that would be unusable or unsafe as a document id", () => {
    for (const bad of ["", "   ", "no-at-sign", "a@b", "a b@c.com", "a@b/c.com", undefined, null, 42, {}]) {
      expect(() => assertValidStaffEmail(bad)).toThrowError();
    }
  });

  it("rejects an absurdly long address rather than truncating it", () => {
    expect(() => assertValidStaffEmail(`${"a".repeat(400)}@example.com`)).toThrowError();
  });
});
