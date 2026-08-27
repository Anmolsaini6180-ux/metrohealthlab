import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

// These tests run against the Firestore emulator and exercise the
// actual firestore.rules file. They are the only place the security
// boundaries are proven rather than asserted in a comment.
//
// On the Spark plan there are no Cloud Functions and therefore no
// custom claims, so a caller's role comes from two documents:
//   system/config.masterAdminUid  — the trusted bootstrap record
//   users/{uid}.role/.status      — every other staff assignment
// Note that the authenticated contexts below carry NO role claim of
// any kind: everything a caller is allowed to do is derived by the
// rules from those documents.
//
// Run with:  npm run test:rules
// (that script starts the emulator for you)

let testEnv: RulesTestEnvironment;

const CUSTOMER_A = "customer-a";
const CUSTOMER_B = "customer-b";
const MASTER = "master-1";
const ADMIN = "admin-1";
const ADMIN_2 = "admin-2";
const SUB_ADMIN = "sub-1";
const SUB_ADMIN_2 = "sub-2";
const AGENT = "agent-1";
const REVOKED_ADMIN = "revoked-1";

const MASTER_EMAIL = "master@example.com";

// No claims anywhere — that is the point.
function ctx(uid: string, token?: Record<string, unknown>) {
  return testEnv.authenticatedContext(uid, token).firestore();
}
function master() {
  return ctx(MASTER);
}
function admin() {
  return ctx(ADMIN);
}
function admin2() {
  return ctx(ADMIN_2);
}
function subAdmin() {
  return ctx(SUB_ADMIN);
}
function agent() {
  return ctx(AGENT);
}
function revokedAdmin() {
  return ctx(REVOKED_ADMIN);
}
function customerA() {
  return ctx(CUSTOMER_A);
}
function customerB() {
  return ctx(CUSTOMER_B);
}
function anonymous() {
  return testEnv.unauthenticatedContext().firestore();
}

// What a staff-management write looks like on the wire. `chain` is
// omitted when acting on an existing member (the rules then require it
// to be left untouched).
function staffWrite(
  callerUid: string,
  role: string,
  status: string,
  chain?: { superAdminId: string; adminId: string; subAdminId: string }
) {
  return {
    role,
    status,
    ...(chain ?? {}),
    updatedBy: callerUid,
    updatedAt: new Date(),
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "metro-health-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed with rules disabled — this is the "what the console and the
  // already-authorized writes produced" starting state.
  await testEnv.withSecurityRulesDisabled(async (ctxAdmin) => {
    const db = ctxAdmin.firestore();

    // The bootstrap record. Only the Firebase Console / Admin SDK can
    // write this, which is exactly what this seeding represents.
    await setDoc(doc(db, "system", "config"), { masterAdminUid: MASTER });

    await setDoc(doc(db, "users", MASTER), {
      uid: MASTER,
      email: MASTER_EMAIL,
      role: "SUPER_ADMIN",
      status: "active",
      superAdminId: "",
      adminId: "",
      subAdminId: "",
    });
    await setDoc(doc(db, "users", ADMIN), {
      uid: ADMIN,
      email: "admin@example.com",
      role: "ADMIN",
      status: "active",
      superAdminId: MASTER,
      adminId: "",
      subAdminId: "",
    });
    await setDoc(doc(db, "users", ADMIN_2), {
      uid: ADMIN_2,
      email: "admin2@example.com",
      role: "ADMIN",
      status: "active",
      superAdminId: MASTER,
      adminId: "",
      subAdminId: "",
    });
    await setDoc(doc(db, "users", SUB_ADMIN), {
      uid: SUB_ADMIN,
      email: "sub@example.com",
      role: "SUB_ADMIN",
      status: "active",
      superAdminId: MASTER,
      adminId: ADMIN,
      subAdminId: "",
    });
    await setDoc(doc(db, "users", SUB_ADMIN_2), {
      uid: SUB_ADMIN_2,
      email: "sub2@example.com",
      role: "SUB_ADMIN",
      status: "active",
      superAdminId: MASTER,
      adminId: ADMIN_2,
      subAdminId: "",
    });
    await setDoc(doc(db, "users", AGENT), {
      uid: AGENT,
      email: "agent@example.com",
      role: "COLLECTION_AGENT",
      status: "active",
      superAdminId: MASTER,
      adminId: ADMIN,
      subAdminId: SUB_ADMIN,
    });
    // Access removed, but the record (and the role field) is still
    // there — the classic "does a revoked admin keep working?" case.
    await setDoc(doc(db, "users", REVOKED_ADMIN), {
      uid: REVOKED_ADMIN,
      email: "revoked@example.com",
      role: "ADMIN",
      status: "revoked",
      superAdminId: MASTER,
      adminId: "",
      subAdminId: "",
    });
    await setDoc(doc(db, "users", CUSTOMER_A), {
      name: "A",
      email: "a@example.com",
      accountType: "customer",
    });

    await setDoc(doc(db, "userEmails", "a@example.com"), { uid: CUSTOMER_A, email: "a@example.com" });

    await setDoc(doc(db, "reports", "report-a"), {
      userId: CUSTOMER_A,
      bookingId: "MH2608200001",
      patientId: "patient-a",
      labId: "lab-1",
      status: "ready",
      storageProvider: "cloudinary",
      publicId: "metro-health/reports/customer-a/abc",
      format: "pdf",
    });
    await setDoc(doc(db, "reports", "report-b"), {
      userId: CUSTOMER_B,
      bookingId: "MH2608200002",
      patientId: "patient-b",
      labId: "lab-1",
      status: "ready",
      storageProvider: "cloudinary",
      publicId: "metro-health/reports/customer-b/def",
      format: "pdf",
    });
    await setDoc(doc(db, "bookings", "booking-a"), {
      userId: CUSTOMER_A,
      bookingStatus: "confirmed",
      paymentStatus: "success",
      finalAmount: 1200,
    });
    await setDoc(doc(db, "payments", "payment-a"), {
      userId: CUSTOMER_A,
      bookingId: "booking-a",
      amount: 1200,
      status: "success",
    });
    await setDoc(doc(db, "mediaAssets", "asset-1"), {
      publicId: "metro-health/banners/x",
      category: "banners",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/x.png",
      uploadedBy: ADMIN,
    });
    await setDoc(doc(db, "coupons", "coupon-1"), {
      code: "SAVE10",
      discountType: "percentage",
      discountValue: 10,
      active: true,
    });
    // Leftover from the Cloud Function era. Nothing may read or write
    // it any more, and it confers nothing.
    await setDoc(doc(db, "staffInvites", "staff@example.com"), {
      email: "staff@example.com",
      role: "SUB_ADMIN",
      status: "active",
      superAdminId: MASTER,
    });
  });
});

// ============================================================
// The bootstrap record — the root of the whole model.
// ============================================================
describe("the system/config bootstrap record", () => {
  it("is readable by a signed-in user (a uid is an identifier, not a secret)", async () => {
    await assertSucceeds(getDoc(doc(customerA(), "system", "config")));
  });

  it("is not readable by an anonymous visitor", async () => {
    await assertFails(getDoc(doc(anonymous(), "system", "config")));
  });

  it("cannot be created, changed or deleted by an ordinary user", async () => {
    await assertFails(updateDoc(doc(customerA(), "system", "config"), { masterAdminUid: CUSTOMER_A }));
    await assertFails(setDoc(doc(customerA(), "system", "config"), { masterAdminUid: CUSTOMER_A }));
    await assertFails(deleteDoc(doc(customerA(), "system", "config")));
    await assertFails(setDoc(doc(customerA(), "system", "other"), { masterAdminUid: CUSTOMER_A }));
  });

  it("cannot be changed by an admin, or even by the master themselves", async () => {
    await assertFails(updateDoc(doc(admin(), "system", "config"), { masterAdminUid: ADMIN }));
    await assertFails(updateDoc(doc(master(), "system", "config"), { masterAdminUid: ADMIN }));
    await assertFails(deleteDoc(doc(master(), "system", "config")));
  });

  it("cannot be enumerated", async () => {
    await assertFails(getDocs(collection(master(), "system")));
  });
});

// ============================================================
// Self-promotion: the single most important thing these rules stop.
// ============================================================
describe("a normal user cannot give themselves a role", () => {
  it("denies writing any role onto their own document", async () => {
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { role: "SUPER_ADMIN" }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { role: "ADMIN" }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { role: "SUB_ADMIN" }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { role: "COLLECTION_AGENT" }));
  });

  it("denies the full staff-record shape, exactly as the app would write it", async () => {
    await assertFails(
      updateDoc(
        doc(customerA(), "users", CUSTOMER_A),
        staffWrite(CUSTOMER_A, "ADMIN", "active", { superAdminId: MASTER, adminId: "", subAdminId: "" })
      )
    );
  });

  it("denies creating a brand-new profile that carries a role", async () => {
    await assertFails(setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B", role: "ADMIN" }));
    await assertFails(
      setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B", role: "SUPER_ADMIN", status: "active" })
    );
  });

  it("denies creating a profile that carries a status or an ownership chain", async () => {
    await assertFails(setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B", status: "active" }));
    await assertFails(setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B", superAdminId: CUSTOMER_B }));
  });

  it("denies flipping status to become active staff", async () => {
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { status: "active" }));
    await assertFails(
      updateDoc(doc(customerA(), "users", CUSTOMER_A), { status: "active", role: "ADMIN" })
    );
  });

  it("denies adding an ownership chain to their own profile", async () => {
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { superAdminId: CUSTOMER_A }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { adminId: CUSTOMER_A }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { subAdminId: CUSTOMER_A }));
  });

  it("denies granting a role to somebody else", async () => {
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_B), { role: "ADMIN" }));
    await assertFails(updateDoc(doc(customerA(), "users", AGENT), { role: "ADMIN" }));
  });

  it("still allows an ordinary profile edit", async () => {
    await assertSucceeds(updateDoc(doc(customerA(), "users", CUSTOMER_A), { name: "A Updated" }));
  });

  it("allows a plain self-signup profile with no authorization fields", async () => {
    await assertSucceeds(
      setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B", email: "b@example.com", accountType: "customer" })
    );
  });

  it("denies deleting a user record entirely", async () => {
    await assertFails(deleteDoc(doc(customerA(), "users", CUSTOMER_A)));
    await assertFails(deleteDoc(doc(master(), "users", ADMIN)));
  });
});

// ============================================================
// Master / bootstrap authority.
// ============================================================
describe("the master account", () => {
  it("lets the bootstrapped uid — and nobody else — materialize its own SUPER_ADMIN record", async () => {
    await assertSucceeds(
      updateDoc(doc(master(), "users", MASTER), { role: "SUPER_ADMIN", status: "active" })
    );
    // Anyone else writing the identical document is refused.
    await assertFails(
      setDoc(doc(customerB(), "users", CUSTOMER_B), {
        role: "SUPER_ADMIN",
        status: "active",
        superAdminId: "",
        adminId: "",
        subAdminId: "",
      })
    );
  });

  it("cannot be demoted, revoked or re-parented by an admin", async () => {
    await assertFails(
      updateDoc(doc(admin(), "users", MASTER), staffWrite(ADMIN, "SUB_ADMIN", "active"))
    );
    await assertFails(updateDoc(doc(admin(), "users", MASTER), staffWrite(ADMIN, "ADMIN", "revoked")));
    await assertFails(updateDoc(doc(admin(), "users", MASTER), { superAdminId: ADMIN }));
  });

  it("cannot be touched by a sub admin or an agent either", async () => {
    await assertFails(
      updateDoc(doc(subAdmin(), "users", MASTER), staffWrite(SUB_ADMIN, "COLLECTION_AGENT", "active"))
    );
    await assertFails(updateDoc(doc(agent(), "users", MASTER), staffWrite(AGENT, "COLLECTION_AGENT", "revoked")));
  });

  it("keeps its authority even if its own record says something else", async () => {
    // Authority comes from system/config, not from the document.
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "users", MASTER), { role: "COLLECTION_AGENT", status: "revoked" });
    });
    await assertSucceeds(getDoc(doc(master(), "users", ADMIN)));
  });

  it("does not let a non-bootstrapped account inherit SUPER_ADMIN from a stored role", async () => {
    // A leftover/hand-written document claiming the title confers
    // nothing at all — the rules only accept ADMIN/SUB_ADMIN/AGENT
    // from a document.
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "users", CUSTOMER_B), {
        uid: CUSTOMER_B,
        role: "SUPER_ADMIN",
        status: "active",
        superAdminId: "",
        adminId: "",
        subAdminId: "",
      });
    });
    await assertFails(getDoc(doc(customerB(), "users", ADMIN)));
    await assertFails(getDoc(doc(customerB(), "coupons", "coupon-1")));
    await assertFails(
      updateDoc(
        doc(customerB(), "users", CUSTOMER_A),
        staffWrite(CUSTOMER_B, "ADMIN", "active", { superAdminId: CUSTOMER_B, adminId: "", subAdminId: "" })
      )
    );
  });
});

// ============================================================
// Staff management, from every rung of the ladder.
// ============================================================
describe("SUPER_ADMIN staff management", () => {
  it("can grant a role to an account that already exists", async () => {
    await assertSucceeds(
      updateDoc(
        doc(master(), "users", CUSTOMER_A),
        staffWrite(MASTER, "ADMIN", "active", { superAdminId: MASTER, adminId: "", subAdminId: "" })
      )
    );
  });

  it("can re-role and revoke an existing member without re-parenting them", async () => {
    await assertSucceeds(updateDoc(doc(master(), "users", AGENT), staffWrite(MASTER, "SUB_ADMIN", "active")));
    await assertSucceeds(updateDoc(doc(master(), "users", AGENT), staffWrite(MASTER, "COLLECTION_AGENT", "revoked")));
  });

  it("cannot mint another SUPER_ADMIN by any route", async () => {
    await assertFails(
      updateDoc(
        doc(master(), "users", CUSTOMER_A),
        staffWrite(MASTER, "SUPER_ADMIN", "active", { superAdminId: MASTER, adminId: "", subAdminId: "" })
      )
    );
    await assertFails(updateDoc(doc(master(), "users", ADMIN), staffWrite(MASTER, "SUPER_ADMIN", "active")));
  });

  it("cannot demote or revoke themselves", async () => {
    await assertFails(updateDoc(doc(master(), "users", MASTER), staffWrite(MASTER, "ADMIN", "active")));
    await assertFails(updateDoc(doc(master(), "users", MASTER), { status: "revoked" }));
  });

  it("cannot smuggle other fields through a staff write", async () => {
    await assertFails(
      updateDoc(doc(master(), "users", ADMIN), { ...staffWrite(MASTER, "SUB_ADMIN", "active"), email: "hijacked@example.com" })
    );
  });

  it("cannot write a role with an invalid status", async () => {
    await assertFails(updateDoc(doc(master(), "users", ADMIN), staffWrite(MASTER, "ADMIN", "whatever")));
  });

  it("cannot forge an ownership chain that points somewhere else", async () => {
    await assertFails(
      updateDoc(
        doc(master(), "users", CUSTOMER_A),
        staffWrite(MASTER, "SUB_ADMIN", "active", { superAdminId: ADMIN, adminId: ADMIN, subAdminId: "" })
      )
    );
  });

  it("cannot write a staff record attributed to somebody else", async () => {
    await assertFails(
      updateDoc(
        doc(master(), "users", CUSTOMER_A),
        staffWrite(ADMIN, "ADMIN", "active", { superAdminId: MASTER, adminId: "", subAdminId: "" })
      )
    );
  });
});

describe("ADMIN staff management", () => {
  it("can create the roles below them, attached to their own subtree", async () => {
    await assertSucceeds(
      updateDoc(
        doc(admin(), "users", CUSTOMER_A),
        staffWrite(ADMIN, "SUB_ADMIN", "active", { superAdminId: MASTER, adminId: ADMIN, subAdminId: "" })
      )
    );
  });

  it("cannot create a SUPER_ADMIN", async () => {
    await assertFails(
      updateDoc(
        doc(admin(), "users", CUSTOMER_A),
        staffWrite(ADMIN, "SUPER_ADMIN", "active", { superAdminId: ADMIN, adminId: "", subAdminId: "" })
      )
    );
  });

  it("cannot promote anyone to ADMIN, including themselves", async () => {
    await assertFails(
      updateDoc(
        doc(admin(), "users", CUSTOMER_A),
        staffWrite(ADMIN, "ADMIN", "active", { superAdminId: MASTER, adminId: "", subAdminId: "" })
      )
    );
    await assertFails(updateDoc(doc(admin(), "users", ADMIN), staffWrite(ADMIN, "ADMIN", "active")));
  });

  it("cannot touch a peer admin", async () => {
    await assertFails(updateDoc(doc(admin(), "users", ADMIN_2), staffWrite(ADMIN, "SUB_ADMIN", "active")));
    await assertFails(updateDoc(doc(admin(), "users", ADMIN_2), staffWrite(ADMIN, "ADMIN", "revoked")));
  });

  it("cannot touch staff in another admin's subtree", async () => {
    await assertFails(
      updateDoc(doc(admin(), "users", SUB_ADMIN_2), staffWrite(ADMIN, "COLLECTION_AGENT", "active"))
    );
    await assertFails(updateDoc(doc(admin(), "users", SUB_ADMIN_2), staffWrite(ADMIN, "SUB_ADMIN", "revoked")));
  });

  it("can revoke someone inside their own subtree", async () => {
    await assertSucceeds(updateDoc(doc(admin(), "users", SUB_ADMIN), staffWrite(ADMIN, "SUB_ADMIN", "revoked")));
    await assertSucceeds(updateDoc(doc(admin(), "users", AGENT), staffWrite(ADMIN, "COLLECTION_AGENT", "revoked")));
  });

  it("cannot revoke or demote themselves", async () => {
    await assertFails(updateDoc(doc(admin(), "users", ADMIN), staffWrite(ADMIN, "ADMIN", "revoked")));
    await assertFails(updateDoc(doc(admin(), "users", ADMIN), staffWrite(ADMIN, "SUB_ADMIN", "active")));
    await assertFails(updateDoc(doc(admin(), "users", ADMIN), { status: "revoked" }));
  });

  it("cannot re-parent an existing member onto themselves", async () => {
    await assertFails(
      updateDoc(doc(admin(), "users", SUB_ADMIN_2), {
        ...staffWrite(ADMIN, "SUB_ADMIN", "active", { superAdminId: MASTER, adminId: ADMIN, subAdminId: "" }),
      })
    );
  });
});

describe("SUB_ADMIN staff management", () => {
  it("can create a collection agent under themselves", async () => {
    await assertSucceeds(
      updateDoc(
        doc(subAdmin(), "users", CUSTOMER_A),
        staffWrite(SUB_ADMIN, "COLLECTION_AGENT", "active", {
          superAdminId: MASTER,
          adminId: ADMIN,
          subAdminId: SUB_ADMIN,
        })
      )
    );
  });

  it("cannot create or modify an ADMIN", async () => {
    await assertFails(
      updateDoc(
        doc(subAdmin(), "users", CUSTOMER_A),
        staffWrite(SUB_ADMIN, "ADMIN", "active", { superAdminId: MASTER, adminId: "", subAdminId: "" })
      )
    );
    await assertFails(updateDoc(doc(subAdmin(), "users", ADMIN), staffWrite(SUB_ADMIN, "COLLECTION_AGENT", "active")));
    await assertFails(updateDoc(doc(subAdmin(), "users", ADMIN), staffWrite(SUB_ADMIN, "ADMIN", "revoked")));
  });

  it("cannot create or modify a SUPER_ADMIN", async () => {
    await assertFails(
      updateDoc(
        doc(subAdmin(), "users", CUSTOMER_A),
        staffWrite(SUB_ADMIN, "SUPER_ADMIN", "active", {
          superAdminId: MASTER,
          adminId: ADMIN,
          subAdminId: SUB_ADMIN,
        })
      )
    );
    await assertFails(updateDoc(doc(subAdmin(), "users", MASTER), staffWrite(SUB_ADMIN, "COLLECTION_AGENT", "revoked")));
  });

  it("cannot promote another sub admin, or themselves", async () => {
    await assertFails(updateDoc(doc(subAdmin(), "users", SUB_ADMIN_2), staffWrite(SUB_ADMIN, "COLLECTION_AGENT", "active")));
    await assertFails(updateDoc(doc(subAdmin(), "users", SUB_ADMIN), staffWrite(SUB_ADMIN, "ADMIN", "active")));
  });

  it("can revoke their own agent", async () => {
    await assertSucceeds(updateDoc(doc(subAdmin(), "users", AGENT), staffWrite(SUB_ADMIN, "COLLECTION_AGENT", "revoked")));
  });
});

describe("COLLECTION_AGENT manages nobody", () => {
  it("cannot grant, change or revoke any role", async () => {
    await assertFails(
      updateDoc(
        doc(agent(), "users", CUSTOMER_A),
        staffWrite(AGENT, "COLLECTION_AGENT", "active", {
          superAdminId: MASTER,
          adminId: ADMIN,
          subAdminId: AGENT,
        })
      )
    );
    await assertFails(updateDoc(doc(agent(), "users", SUB_ADMIN), staffWrite(AGENT, "COLLECTION_AGENT", "revoked")));
    await assertFails(updateDoc(doc(agent(), "users", AGENT), staffWrite(AGENT, "SUB_ADMIN", "active")));
  });

  it("cannot read the staff directory", async () => {
    await assertFails(getDocs(query(collection(agent(), "users"), where("adminId", "==", ADMIN))));
    await assertFails(getDoc(doc(agent(), "users", SUB_ADMIN)));
  });

  it("cannot look somebody up in the email directory", async () => {
    await assertFails(getDoc(doc(agent(), "userEmails", "a@example.com")));
  });
});

// ============================================================
// Revocation actually bites — no token to wait out.
// ============================================================
describe("a revoked staff member", () => {
  it("loses read access to privileged collections immediately", async () => {
    await assertFails(getDoc(doc(revokedAdmin(), "coupons", "coupon-1")));
    await assertFails(getDoc(doc(revokedAdmin(), "mediaAssets", "asset-1")));
    await assertFails(getDoc(doc(revokedAdmin(), "reports", "report-a")));
    await assertFails(getDoc(doc(revokedAdmin(), "users", ADMIN)));
  });

  it("cannot manage staff any more", async () => {
    await assertFails(
      updateDoc(
        doc(revokedAdmin(), "users", CUSTOMER_A),
        staffWrite(REVOKED_ADMIN, "SUB_ADMIN", "active", {
          superAdminId: MASTER,
          adminId: REVOKED_ADMIN,
          subAdminId: "",
        })
      )
    );
  });

  it("cannot restore their own access", async () => {
    await assertFails(updateDoc(doc(revokedAdmin(), "users", REVOKED_ADMIN), { status: "active" }));
    await assertFails(
      updateDoc(doc(revokedAdmin(), "users", REVOKED_ADMIN), staffWrite(REVOKED_ADMIN, "ADMIN", "active"))
    );
  });

  it("cannot write to the catalog", async () => {
    await assertFails(
      setDoc(doc(revokedAdmin(), "tests", "forged"), { name: "Forged", updatedBy: REVOKED_ADMIN })
    );
  });
});

// ============================================================
// Hierarchy-scoped reads.
// ============================================================
describe("staff directory scoping", () => {
  it("lets a super admin list staff, but not dump the whole users collection", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(master(), "users"),
          where("role", "in", ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"])
        )
      )
    );
    await assertFails(getDocs(collection(master(), "users")));
    await assertFails(getDocs(query(collection(master(), "users"), where("accountType", "==", "customer"))));
  });

  it("lets an admin list only their own subtree", async () => {
    await assertSucceeds(getDocs(query(collection(admin(), "users"), where("adminId", "==", ADMIN))));
    await assertFails(getDocs(query(collection(admin(), "users"), where("adminId", "==", ADMIN_2))));
    await assertFails(getDocs(collection(admin(), "users")));
    await assertFails(
      getDocs(query(collection(admin(), "users"), where("role", "in", ["ADMIN", "SUB_ADMIN"])))
    );
  });

  it("lets a sub admin list only their own agents", async () => {
    await assertSucceeds(getDocs(query(collection(subAdmin(), "users"), where("subAdminId", "==", SUB_ADMIN))));
    await assertFails(getDocs(query(collection(subAdmin(), "users"), where("adminId", "==", ADMIN))));
  });

  it("scopes individual reads the same way", async () => {
    await assertSucceeds(getDoc(doc(master(), "users", CUSTOMER_A)));
    await assertSucceeds(getDoc(doc(admin(), "users", SUB_ADMIN)));
    await assertFails(getDoc(doc(admin(), "users", SUB_ADMIN_2)));
    await assertFails(getDoc(doc(admin(), "users", CUSTOMER_A)));
    await assertSucceeds(getDoc(doc(subAdmin(), "users", AGENT)));
    await assertFails(getDoc(doc(subAdmin(), "users", ADMIN)));
    await assertFails(getDoc(doc(customerB(), "users", CUSTOMER_A)));
  });
});

// ============================================================
// The email -> uid directory that makes "grant by email" possible
// without letting anybody enumerate accounts.
// ============================================================
describe("the userEmails directory", () => {
  it("lets a signed-in user publish their own verified address", async () => {
    const db = ctx(CUSTOMER_B, { email: "b@example.com", email_verified: true });
    await assertSucceeds(
      setDoc(doc(db, "userEmails", "b@example.com"), { uid: CUSTOMER_B, email: "b@example.com" })
    );
  });

  it("refuses an address the caller has not verified", async () => {
    const db = ctx(CUSTOMER_B, { email: "b@example.com", email_verified: false });
    await assertFails(
      setDoc(doc(db, "userEmails", "b@example.com"), { uid: CUSTOMER_B, email: "b@example.com" })
    );
  });

  it("refuses claiming somebody else's address, or pointing an address at another uid", async () => {
    const db = ctx(CUSTOMER_B, { email: "b@example.com", email_verified: true });
    await assertFails(
      setDoc(doc(db, "userEmails", "master@example.com"), { uid: CUSTOMER_B, email: "master@example.com" })
    );
    await assertFails(
      setDoc(doc(db, "userEmails", "b@example.com"), { uid: MASTER, email: "b@example.com" })
    );
  });

  it("refuses to let anyone overwrite an existing mapping", async () => {
    const db = ctx(CUSTOMER_B, { email: "b@example.com", email_verified: true });
    await assertFails(
      setDoc(doc(db, "userEmails", "a@example.com"), { uid: CUSTOMER_B, email: "a@example.com" })
    );
    await assertFails(deleteDoc(doc(db, "userEmails", "b@example.com")));
  });

  it("is readable by staff who manage people, one document at a time", async () => {
    await assertSucceeds(getDoc(doc(admin(), "userEmails", "a@example.com")));
    await assertSucceeds(getDoc(doc(subAdmin(), "userEmails", "a@example.com")));
    await assertFails(getDocs(collection(admin(), "userEmails")));
  });

  it("is not a lookup table for customers", async () => {
    await assertFails(getDoc(doc(customerB(), "userEmails", "a@example.com")));
    await assertFails(getDoc(doc(anonymous(), "userEmails", "a@example.com")));
  });
});

// ============================================================
// The legacy collection stays sealed.
// ============================================================
describe("legacy staffInvites", () => {
  it("is unreadable and unwritable by everyone, including the master", async () => {
    await assertFails(getDoc(doc(customerA(), "staffInvites", "staff@example.com")));
    await assertFails(getDoc(doc(master(), "staffInvites", "staff@example.com")));
    await assertFails(getDocs(collection(admin(), "staffInvites")));
    await assertFails(
      setDoc(doc(customerA(), "staffInvites", "a@example.com"), { role: "SUPER_ADMIN", status: "active" })
    );
    await assertFails(
      setDoc(doc(master(), "staffInvites", "new@example.com"), { role: "ADMIN", status: "active" })
    );
    await assertFails(deleteDoc(doc(admin(), "staffInvites", "staff@example.com")));
  });
});

// ============================================================
// Everything below is pre-existing behaviour, re-proven against the
// new role source.
// ============================================================
describe("unauthenticated access", () => {
  it("is denied everywhere it matters", async () => {
    await assertFails(getDoc(doc(anonymous(), "reports", "report-a")));
    await assertFails(getDoc(doc(anonymous(), "bookings", "booking-a")));
    await assertFails(getDoc(doc(anonymous(), "payments", "payment-a")));
    await assertFails(getDoc(doc(anonymous(), "coupons", "coupon-1")));
    await assertFails(getDoc(doc(anonymous(), "mediaAssets", "asset-1")));
    await assertFails(getDoc(doc(anonymous(), "users", ADMIN)));
    await assertFails(getDoc(doc(anonymous(), "auditLogs", "log-1")));
    await assertFails(setDoc(doc(anonymous(), "users", ADMIN), { role: "SUPER_ADMIN" }));
  });

  it("can still read the public catalog", async () => {
    await assertSucceeds(getDoc(doc(anonymous(), "tests", "anything")));
  });
});

describe("reports authorization", () => {
  it("lets a customer read their own report metadata", async () => {
    await assertSucceeds(getDoc(doc(customerA(), "reports", "report-a")));
  });

  it("denies a customer reading another customer's report", async () => {
    await assertFails(getDoc(doc(customerA(), "reports", "report-b")));
  });

  it("lets an admin read a report", async () => {
    await assertSucceeds(getDoc(doc(admin(), "reports", "report-a")));
  });

  it("denies a collection agent reading a report", async () => {
    await assertFails(getDoc(doc(agent(), "reports", "report-a")));
  });

  it("denies a customer creating a report for themselves", async () => {
    await assertFails(
      setDoc(doc(customerA(), "reports", "forged"), { userId: CUSTOMER_A, status: "ready" })
    );
  });

  it("denies an ADMIN creating a report directly (server-only)", async () => {
    await assertFails(
      setDoc(doc(admin(), "reports", "forged"), {
        userId: CUSTOMER_B,
        status: "ready",
        updatedBy: ADMIN,
      })
    );
  });

  it("denies an ADMIN repointing an existing report's file", async () => {
    await assertFails(
      updateDoc(doc(admin(), "reports", "report-a"), {
        publicId: "metro-health/reports/customer-b/def",
        updatedBy: ADMIN,
      })
    );
  });

  it("denies a customer flipping their own report to ready", async () => {
    await assertFails(updateDoc(doc(customerA(), "reports", "report-a"), { status: "ready" }));
  });

  it("denies deleting a report", async () => {
    await assertFails(deleteDoc(doc(admin(), "reports", "report-a")));
  });
});

describe("bookings and payments", () => {
  it("lets the owner read their booking", async () => {
    await assertSucceeds(getDoc(doc(customerA(), "bookings", "booking-a")));
  });

  it("denies another customer reading that booking", async () => {
    await assertFails(getDoc(doc(customerB(), "bookings", "booking-a")));
  });

  it("lets staff in scope read a booking", async () => {
    await assertSucceeds(getDoc(doc(master(), "bookings", "booking-a")));
    // An ADMIN sees the unassigned confirmed pool.
    await assertSucceeds(getDoc(doc(admin(), "bookings", "booking-a")));
    // A collection agent sees only what is assigned to them.
    await assertFails(getDoc(doc(agent(), "bookings", "booking-a")));
  });

  it("denies any client write to a booking, including the owner", async () => {
    await assertFails(updateDoc(doc(customerA(), "bookings", "booking-a"), { bookingStatus: "completed" }));
  });

  it("denies a customer marking their own booking paid", async () => {
    await assertFails(updateDoc(doc(customerA(), "bookings", "booking-a"), { paymentStatus: "success" }));
  });

  it("denies a customer changing a booking's amount", async () => {
    await assertFails(updateDoc(doc(customerA(), "bookings", "booking-a"), { finalAmount: 1 }));
  });

  it("lets the owner read their payment but never write it", async () => {
    await assertSucceeds(getDoc(doc(customerA(), "payments", "payment-a")));
    await assertFails(updateDoc(doc(customerA(), "payments", "payment-a"), { status: "success" }));
  });

  it("denies another customer reading that payment", async () => {
    await assertFails(getDoc(doc(customerB(), "payments", "payment-a")));
  });
});

describe("coupons and media", () => {
  it("denies a customer reading the coupons collection", async () => {
    await assertFails(getDoc(doc(customerA(), "coupons", "coupon-1")));
  });

  it("lets an admin read coupons", async () => {
    await assertSucceeds(getDoc(doc(admin(), "coupons", "coupon-1")));
  });

  it("denies a sub admin and an agent reading coupons", async () => {
    await assertFails(getDoc(doc(subAdmin(), "coupons", "coupon-1")));
    await assertFails(getDoc(doc(agent(), "coupons", "coupon-1")));
  });

  it("denies a customer creating a coupon", async () => {
    await assertFails(
      setDoc(doc(customerA(), "coupons", "free"), {
        code: "FREE",
        discountType: "percentage",
        discountValue: 100,
        updatedBy: CUSTOMER_A,
      })
    );
  });

  it("lets an admin write the catalog when they attribute the change to themselves", async () => {
    await assertSucceeds(setDoc(doc(admin(), "tests", "new-test"), { name: "CBC", updatedBy: ADMIN }));
    await assertFails(setDoc(doc(admin(), "tests", "new-test-2"), { name: "CBC", updatedBy: MASTER }));
  });

  it("denies a sub admin writing the catalog", async () => {
    await assertFails(setDoc(doc(subAdmin(), "tests", "new-test-3"), { name: "CBC", updatedBy: SUB_ADMIN }));
  });

  it("lets an admin list the media library", async () => {
    await assertSucceeds(getDocs(collection(admin(), "mediaAssets")));
  });

  it("denies a customer reading the media library", async () => {
    await assertFails(getDoc(doc(customerA(), "mediaAssets", "asset-1")));
  });

  it("denies an admin writing a media record directly (server-only)", async () => {
    await assertFails(
      setDoc(doc(admin(), "mediaAssets", "forged"), {
        publicId: "anything",
        category: "banners",
        updatedBy: ADMIN,
      })
    );
  });
});

describe("internal ledgers and audit", () => {
  it("denies all client access to processedWebhookEvents", async () => {
    await assertFails(getDoc(doc(admin(), "processedWebhookEvents", "pay_1:payment.captured")));
    await assertFails(setDoc(doc(admin(), "processedWebhookEvents", "x"), { outcome: "spoof" }));
  });

  it("denies all client access to priceQuotes", async () => {
    await assertFails(getDoc(doc(customerA(), "priceQuotes", "q1")));
    await assertFails(setDoc(doc(customerA(), "priceQuotes", "q1"), { finalAmount: 1 }));
  });

  it("denies a client writing audit logs", async () => {
    await assertFails(setDoc(doc(admin(), "auditLogs", "fake"), { action: "nothing.happened" }));
    await assertFails(setDoc(doc(master(), "auditLogs", "fake"), { action: "nothing.happened" }));
  });

  it("keeps audit log reads to the super admin", async () => {
    await assertSucceeds(getDoc(doc(master(), "auditLogs", "log-1")));
    await assertFails(getDoc(doc(admin(), "auditLogs", "log-1")));
  });
});
