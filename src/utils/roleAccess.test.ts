import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  adminAccessDenialReason,
  adminHomePathForRole,
  adminMenuLabelForRole,
  assignableRoles,
  buildStaffContext,
  canAssignRole,
  canEditStaffMember,
  canManageStaff,
  hasAuthorityOver,
  isAdminRole,
  ownershipChainFor,
  roleFromStaffRecord,
} from "./roleAccess";
import { CREATABLE_ROLES, type AdminRole, type StaffContext } from "@/types/team";

const ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

const MASTER = "master-uid";

function ctx(partial: Partial<StaffContext> & { uid: string; role: AdminRole | null }): StaffContext {
  return {
    status: partial.role ? "active" : null,
    isMaster: partial.uid === MASTER,
    masterUid: MASTER,
    ...partial,
  };
}

describe("recognising a staff role", () => {
  it("accepts exactly the four real roles", () => {
    for (const role of ROLES) expect(isAdminRole(role)).toBe(true);
  });

  it("rejects anything a customer's record would carry", () => {
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

// This mirrors assignedRole() in firestore.rules. If these two ever
// disagree the UI is merely wrong; the rules copy is the one that
// decides what a request may do.
describe("reading a role out of a stored staff record", () => {
  it("accepts an active assignment", () => {
    expect(roleFromStaffRecord({ role: "ADMIN", status: "active" })).toBe("ADMIN");
    expect(roleFromStaffRecord({ role: "SUB_ADMIN", status: "active" })).toBe("SUB_ADMIN");
    expect(roleFromStaffRecord({ role: "COLLECTION_AGENT", status: "active" })).toBe("COLLECTION_AGENT");
  });

  it("gives a revoked or deactivated member nothing", () => {
    expect(roleFromStaffRecord({ role: "ADMIN", status: "revoked" })).toBeNull();
    expect(roleFromStaffRecord({ role: "ADMIN", status: "inactive" })).toBeNull();
    // No status at all is not "active" either.
    expect(roleFromStaffRecord({ role: "ADMIN" })).toBeNull();
  });

  it("never honours a stored SUPER_ADMIN", () => {
    // Only the uid in system/config is a super admin. A document that
    // claims the title — legacy data, or a write that somehow got
    // through — confers nothing.
    expect(roleFromStaffRecord({ role: "SUPER_ADMIN", status: "active" })).toBeNull();
  });

  it("ignores junk", () => {
    expect(roleFromStaffRecord(null)).toBeNull();
    expect(roleFromStaffRecord(undefined)).toBeNull();
    expect(roleFromStaffRecord({ role: "OWNER", status: "active" })).toBeNull();
    expect(roleFromStaffRecord({ status: "active" })).toBeNull();
  });
});

describe("building the signed-in account's authorization context", () => {
  it("makes the bootstrapped uid — and only that uid — SUPER_ADMIN", () => {
    expect(buildStaffContext(MASTER, MASTER, null).role).toBe("SUPER_ADMIN");
    expect(buildStaffContext(MASTER, MASTER, null).isMaster).toBe(true);
    expect(buildStaffContext("someone-else", MASTER, null).role).toBeNull();
    expect(buildStaffContext("someone-else", MASTER, { role: "SUPER_ADMIN", status: "active" }).role).toBeNull();
  });

  it("treats an unbootstrapped project as having no super admin at all", () => {
    expect(buildStaffContext("anyone", "", null).role).toBeNull();
    expect(buildStaffContext("anyone", "", null).isMaster).toBe(false);
    // An empty masterUid must never match an empty uid either.
    expect(buildStaffContext("", "", null).isMaster).toBe(false);
  });

  it("carries the ownership chain through for scoped queries", () => {
    const context = buildStaffContext("agent-1", MASTER, {
      role: "COLLECTION_AGENT",
      status: "active",
      superAdminId: MASTER,
      adminId: "admin-1",
      subAdminId: "sub-1",
    });
    expect(context.role).toBe("COLLECTION_AGENT");
    expect(context.adminId).toBe("admin-1");
    expect(context.subAdminId).toBe("sub-1");
  });
});

describe("admin dashboard entry point", () => {
  it("offers no admin destination at all to a non-staff user", () => {
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
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
  });

  it("lets a SUB_ADMIN offer only COLLECTION_AGENT", () => {
    expect(assignableRoles("SUB_ADMIN")).toEqual(["COLLECTION_AGENT"]);
    expect(canAssignRole("SUB_ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("SUB_ADMIN", "SUB_ADMIN")).toBe(false);
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

  it("only lets the three management roles reach the staff screen", () => {
    expect(canManageStaff("SUPER_ADMIN")).toBe(true);
    expect(canManageStaff("ADMIN")).toBe(true);
    expect(canManageStaff("SUB_ADMIN")).toBe(true);
    expect(canManageStaff("COLLECTION_AGENT")).toBe(false);
    expect(canManageStaff(null)).toBe(false);
  });
});

// Mirrors expectedSuperAdminId/expectedAdminId/expectedSubAdminId in
// firestore.rules: the chain is fixed by WHO writes it.
describe("the ownership chain a new staff record gets", () => {
  it("puts a super admin's hires directly under them", () => {
    expect(ownershipChainFor(ctx({ uid: MASTER, role: "SUPER_ADMIN" }))).toEqual({
      superAdminId: MASTER,
      adminId: "",
      subAdminId: "",
    });
  });

  it("puts an admin's hires under that admin, keeping the super above", () => {
    expect(
      ownershipChainFor(ctx({ uid: "admin-1", role: "ADMIN", superAdminId: MASTER }))
    ).toEqual({ superAdminId: MASTER, adminId: "admin-1", subAdminId: "" });
  });

  it("puts a sub admin's hires at the bottom of their own chain", () => {
    expect(
      ownershipChainFor(
        ctx({ uid: "sub-1", role: "SUB_ADMIN", superAdminId: MASTER, adminId: "admin-1" })
      )
    ).toEqual({ superAdminId: MASTER, adminId: "admin-1", subAdminId: "sub-1" });
  });

  it("never leaves an ancestor slot undefined", () => {
    const chain = ownershipChainFor(ctx({ uid: "sub-9", role: "SUB_ADMIN" }));
    expect(chain).toEqual({ superAdminId: "", adminId: "", subAdminId: "sub-9" });
  });
});

describe("authority over an existing staff record", () => {
  const admin = ctx({ uid: "admin-1", role: "ADMIN", superAdminId: MASTER });
  const sub = ctx({ uid: "sub-1", role: "SUB_ADMIN", superAdminId: MASTER, adminId: "admin-1" });
  const master = ctx({ uid: MASTER, role: "SUPER_ADMIN" });

  it("gives the super admin authority over everyone", () => {
    expect(hasAuthorityOver(master, { role: "ADMIN" })).toBe(true);
    expect(hasAuthorityOver(master, { role: "COLLECTION_AGENT", adminId: "someone" })).toBe(true);
  });

  it("limits an admin to their own subtree", () => {
    expect(hasAuthorityOver(admin, { role: "SUB_ADMIN", adminId: "admin-1" })).toBe(true);
    expect(hasAuthorityOver(admin, { role: "SUB_ADMIN", adminId: "admin-2" })).toBe(false);
    expect(hasAuthorityOver(admin, { role: "ADMIN" })).toBe(false);
  });

  it("limits a sub admin to their own agents", () => {
    expect(hasAuthorityOver(sub, { role: "COLLECTION_AGENT", subAdminId: "sub-1" })).toBe(true);
    expect(hasAuthorityOver(sub, { role: "COLLECTION_AGENT", subAdminId: "sub-2" })).toBe(false);
    expect(hasAuthorityOver(sub, { role: "SUB_ADMIN", adminId: "admin-1" })).toBe(false);
  });

  it("gives a collection agent authority over nobody", () => {
    const agent = ctx({ uid: "agent-1", role: "COLLECTION_AGENT" });
    expect(hasAuthorityOver(agent, { role: "COLLECTION_AGENT", subAdminId: "agent-1" })).toBe(false);
  });
});

describe("which rows the staff table lets you edit", () => {
  const master = ctx({ uid: MASTER, role: "SUPER_ADMIN" });
  const admin = ctx({ uid: "admin-1", role: "ADMIN", superAdminId: MASTER });

  it("never lets you edit yourself", () => {
    expect(canEditStaffMember(admin, { uid: "admin-1", role: "ADMIN" })).toBe(false);
    expect(canEditStaffMember(master, { uid: MASTER, role: "SUPER_ADMIN" })).toBe(false);
  });

  it("never lets anyone edit the master account", () => {
    expect(canEditStaffMember(admin, { uid: MASTER, role: "SUPER_ADMIN" })).toBe(false);
    const otherSuper = ctx({ uid: "super-2", role: "SUPER_ADMIN" });
    expect(canEditStaffMember(otherSuper, { uid: MASTER, role: "SUPER_ADMIN" })).toBe(false);
  });

  it("lets a super admin edit anyone else", () => {
    expect(canEditStaffMember(master, { uid: "admin-1", role: "ADMIN" })).toBe(true);
    expect(canEditStaffMember(master, { uid: "agent-1", role: "COLLECTION_AGENT", subAdminId: "sub-1" })).toBe(true);
  });

  it("stops an admin editing a peer or anyone outside their subtree", () => {
    expect(canEditStaffMember(admin, { uid: "admin-2", role: "ADMIN" })).toBe(false);
    expect(canEditStaffMember(admin, { uid: "sub-9", role: "SUB_ADMIN", adminId: "admin-2" })).toBe(false);
    expect(canEditStaffMember(admin, { uid: "sub-1", role: "SUB_ADMIN", adminId: "admin-1" })).toBe(true);
  });

  it("gives a collection agent nothing to edit", () => {
    const agent = ctx({ uid: "agent-1", role: "COLLECTION_AGENT" });
    expect(canEditStaffMember(agent, { uid: "agent-2", role: "COLLECTION_AGENT" })).toBe(false);
  });
});

// The frontend copy of the hierarchy exists only to populate dropdowns
// and shape queries; firestore.rules holds the copy that enforces. This
// pins them together so a change to one is a visible failure rather
// than a silent divergence.
describe("hierarchy table matches the security rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const canAssignSource = rules.slice(rules.indexOf("function canAssign("));

  it("declares the same assignable roles as canAssign() in firestore.rules", () => {
    expect(canAssignSource).toContain(
      "callerRole == 'SUPER_ADMIN' && targetRole in ['ADMIN', 'SUB_ADMIN', 'COLLECTION_AGENT']"
    );
    expect(canAssignSource).toContain("callerRole == 'ADMIN' && targetRole in ['SUB_ADMIN', 'COLLECTION_AGENT']");
    expect(canAssignSource).toContain("callerRole == 'SUB_ADMIN' && targetRole == 'COLLECTION_AGENT'");
  });

  it("keeps COLLECTION_AGENT out of the rules' assignable table entirely", () => {
    const canAssignBody = canAssignSource.slice(0, canAssignSource.indexOf("}"));
    expect(canAssignBody).not.toContain("callerRole == 'COLLECTION_AGENT'");
    expect(CREATABLE_ROLES.COLLECTION_AGENT).toEqual([]);
  });

  it("never lets the rules assign SUPER_ADMIN", () => {
    const canAssignBody = canAssignSource.slice(0, canAssignSource.indexOf("}"));
    expect(canAssignBody).not.toContain("targetRole == 'SUPER_ADMIN'");
    expect(canAssignBody).not.toContain("'SUPER_ADMIN']");
  });
});

describe("explaining why an account resolved to no admin role", () => {
  it("says nothing when the account DOES have a role", () => {
    expect(adminAccessDenialReason(ctx({ uid: "u1", role: "ADMIN" }))).toBe("");
    expect(adminAccessDenialReason(ctx({ uid: MASTER, role: "SUPER_ADMIN" }))).toBe("");
  });

  it("points at the bootstrap document when the project has no super admin yet", () => {
    const notBootstrapped = { uid: "u1", role: null, status: null, isMaster: false, masterUid: "" };
    expect(adminAccessDenialReason(notBootstrapped)).toContain("system/config.masterAdminUid");
  });

  it("distinguishes 'no staff record' from 'record is not active'", () => {
    const noRecord = adminAccessDenialReason(ctx({ uid: "u1", role: null, status: null }));
    const revoked = adminAccessDenialReason(ctx({ uid: "u1", role: null, status: "revoked" }));
    expect(noRecord).toContain("no staff status");
    expect(revoked).toContain('"revoked"');
    expect(noRecord).not.toBe(revoked);
  });

  it("explains that a stored SUPER_ADMIN is never honoured", () => {
    // Active record, but a role the model refuses to take from a
    // document — the single most confusing way to end up locked out.
    const storedSuper = ctx({ uid: "u1", role: null, status: "active" });
    expect(adminAccessDenialReason(storedSuper)).toContain("SUPER_ADMIN");
    expect(adminAccessDenialReason(storedSuper)).toContain("system/config");
  });
});

describe("the admin record shape the app actually accepts", () => {
  // Regression guard for the failure this fix was written for: an
  // `admins/{uid}` document with role "superAdmin" / active true.
  it("rejects the admins/{uid} shape outright", () => {
    expect(roleFromStaffRecord({ role: "superAdmin", active: true } as never)).toBeNull();
    expect(roleFromStaffRecord({ role: "superAdmin", status: "active" })).toBeNull();
    expect(roleFromStaffRecord({ role: "SUPER_ADMIN", status: "active" })).toBeNull();
    expect(roleFromStaffRecord({ role: "ADMIN", active: true } as never)).toBeNull();
  });

  it("accepts only status:'active' plus a delegable role", () => {
    expect(roleFromStaffRecord({ role: "ADMIN", status: "active" })).toBe("ADMIN");
    expect(roleFromStaffRecord({ role: "SUB_ADMIN", status: "active" })).toBe("SUB_ADMIN");
    expect(roleFromStaffRecord({ role: "COLLECTION_AGENT", status: "active" })).toBe("COLLECTION_AGENT");
  });

  it("grants SUPER_ADMIN from the bootstrap document and nowhere else", () => {
    expect(buildStaffContext("u1", "u1", null).role).toBe("SUPER_ADMIN");
    expect(buildStaffContext("u1", "other", { role: "SUPER_ADMIN", status: "active" }).role).toBeNull();
  });
});
