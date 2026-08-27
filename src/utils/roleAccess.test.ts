import { describe, it, expect } from "vitest";
import {
  adminHomePathForRole,
  adminMenuLabelForRole,
  assignableRoles,
  canAssignRole,
  isAdminRole,
} from "./roleAccess";
import { CREATABLE_ROLES, type AdminRole } from "@/types/team";

const ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

describe("recognising a staff role", () => {
  it("accepts exactly the four real roles", () => {
    for (const role of ROLES) expect(isAdminRole(role)).toBe(true);
  });

  it("rejects anything a customer's token would carry", () => {
    // A normal customer's ID token has no role claim at all. Nothing
    // about that must read as staff.
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole("")).toBe(false);
    expect(isAdminRole("CUSTOMER")).toBe(false);
    expect(isAdminRole("admin")).toBe(false); // case matters
    expect(isAdminRole(true)).toBe(false);
    expect(isAdminRole({ role: "ADMIN" })).toBe(false);
    expect(isAdminRole(["ADMIN"])).toBe(false);
  });
});

describe("admin dashboard entry point", () => {
  it("offers no admin destination at all to a non-staff user", () => {
    // This is what keeps the Admin Dashboard item out of a customer's
    // profile menu. (Hiding it is convenience only — AdminProtectedRoute
    // and firestore.rules are what actually deny access.)
    expect(adminHomePathForRole(null)).toBeNull();
    expect(adminHomePathForRole(undefined)).toBeNull();
    expect(adminHomePathForRole("CUSTOMER")).toBeNull();
    expect(adminMenuLabelForRole(null)).toBeNull();
  });

  it("sends the three management roles to /admin", () => {
    expect(adminHomePathForRole("SUPER_ADMIN")).toBe("/admin");
    expect(adminHomePathForRole("ADMIN")).toBe("/admin");
    expect(adminHomePathForRole("SUB_ADMIN")).toBe("/admin");
  });

  it("sends a collection agent to their own workspace instead", () => {
    expect(adminHomePathForRole("COLLECTION_AGENT")).toBe("/agent");
    expect(adminMenuLabelForRole("COLLECTION_AGENT")).toBe("My Collections");
  });
});

describe("which roles the staff form may offer", () => {
  it("never offers SUPER_ADMIN to anyone", () => {
    for (const role of ROLES) {
      expect(assignableRoles(role)).not.toContain("SUPER_ADMIN");
      expect(canAssignRole(role, "SUPER_ADMIN")).toBe(false);
    }
  });

  it("gives a SUPER_ADMIN the three subordinate roles", () => {
    expect(assignableRoles("SUPER_ADMIN")).toEqual(["ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"]);
  });

  it("does not let an ADMIN offer ADMIN", () => {
    expect(assignableRoles("ADMIN")).toEqual(["SUB_ADMIN", "COLLECTION_AGENT"]);
  });

  it("gives a customer or a collection agent nothing to assign", () => {
    expect(assignableRoles(null)).toEqual([]);
    expect(assignableRoles("CUSTOMER")).toEqual([]);
    expect(assignableRoles("COLLECTION_AGENT")).toEqual([]);
  });

  it("returns a fresh array so a caller cannot mutate the shared table", () => {
    const first = assignableRoles("SUPER_ADMIN");
    first.push("SUPER_ADMIN");
    expect(assignableRoles("SUPER_ADMIN")).not.toContain("SUPER_ADMIN");
    expect(CREATABLE_ROLES.SUPER_ADMIN).not.toContain("SUPER_ADMIN");
  });
});

// The frontend copy of the hierarchy table exists only to populate a
// dropdown; functions/src/roleClaims.ts holds the copy that enforces.
// This pins them together so a change to one is a visible failure
// rather than a silent divergence.
describe("hierarchy table matches the server's", () => {
  const SERVER_CREATABLE_ROLES: Record<AdminRole, AdminRole[]> = {
    SUPER_ADMIN: ["ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"],
    ADMIN: ["SUB_ADMIN", "COLLECTION_AGENT"],
    SUB_ADMIN: ["COLLECTION_AGENT"],
    COLLECTION_AGENT: [],
  };

  it("is identical to functions/src/roleClaims.ts CREATABLE_ROLES", () => {
    expect(CREATABLE_ROLES).toEqual(SERVER_CREATABLE_ROLES);
  });
});
