import { describe, expect, it, vi } from "vitest";

vi.mock("./admin", () => ({ db: {} }));

const { deriveRole, canManageCatalogRole, canHandleBookingsRole } = await import("./callerRole");

const MASTER = "master-uid";

function docs(masterAdminUid: string, userDoc: { role?: unknown; status?: unknown } | null) {
  return { masterAdminUid, userDoc };
}

// These mirror the assertions in tests/rules/firestore.rules.test.ts.
// A function and a rule disagreeing about who is an admin is the exact
// bug this pairing exists to prevent.
describe("deriveRole", () => {
  it("makes the bootstrap uid SUPER_ADMIN", () => {
    expect(deriveRole(MASTER, docs(MASTER, null))).toBe("SUPER_ADMIN");
  });

  it("never accepts SUPER_ADMIN from a user document", () => {
    expect(deriveRole("someone", docs(MASTER, { role: "SUPER_ADMIN", status: "active" }))).toBeNull();
  });

  it("reads an assigned role from an active user document", () => {
    expect(deriveRole("u", docs(MASTER, { role: "ADMIN", status: "active" }))).toBe("ADMIN");
    expect(deriveRole("u", docs(MASTER, { role: "SUB_ADMIN", status: "active" }))).toBe("SUB_ADMIN");
    expect(deriveRole("u", docs(MASTER, { role: "COLLECTION_AGENT", status: "active" }))).toBe("COLLECTION_AGENT");
  });

  it("ignores a role whose record is not active", () => {
    expect(deriveRole("u", docs(MASTER, { role: "ADMIN", status: "revoked" }))).toBeNull();
    expect(deriveRole("u", docs(MASTER, { role: "ADMIN" }))).toBeNull();
  });

  it("gives an unknown role nothing", () => {
    expect(deriveRole("u", docs(MASTER, { role: "OWNER", status: "active" }))).toBeNull();
    expect(deriveRole("u", docs(MASTER, null))).toBeNull();
  });

  it("confers nothing when the project is not bootstrapped", () => {
    expect(deriveRole("anyone", docs("", null))).toBeNull();
    // An empty master uid must not match an empty caller uid.
    expect(deriveRole("", docs("", null))).toBeNull();
  });
});

describe("role capability helpers", () => {
  it("limits catalogue management to super admin and admin", () => {
    expect(canManageCatalogRole("SUPER_ADMIN")).toBe(true);
    expect(canManageCatalogRole("ADMIN")).toBe(true);
    expect(canManageCatalogRole("SUB_ADMIN")).toBe(false);
    expect(canManageCatalogRole("COLLECTION_AGENT")).toBe(false);
    expect(canManageCatalogRole(null)).toBe(false);
  });

  it("lets sub admins handle bookings but never collection agents", () => {
    expect(canHandleBookingsRole("SUPER_ADMIN")).toBe(true);
    expect(canHandleBookingsRole("ADMIN")).toBe(true);
    expect(canHandleBookingsRole("SUB_ADMIN")).toBe(true);
    expect(canHandleBookingsRole("COLLECTION_AGENT")).toBe(false);
    expect(canHandleBookingsRole(null)).toBe(false);
  });
});
