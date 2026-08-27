import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

// These tests run against the Firestore emulator and exercise the
// actual firestore.rules file. They are the only place the security
// boundaries are proven rather than asserted in a comment.
//
// Run with:  npm run test:rules
// (that script starts the emulator for you)

let testEnv: RulesTestEnvironment;

const CUSTOMER_A = "customer-a";
const CUSTOMER_B = "customer-b";
const ADMIN = "admin-1";
const AGENT = "agent-1";
const SUPER_ADMIN = "super-1";

function admin() {
  return testEnv.authenticatedContext(ADMIN, { role: "ADMIN" }).firestore();
}
function agent() {
  return testEnv.authenticatedContext(AGENT, { role: "COLLECTION_AGENT" }).firestore();
}
function superAdmin() {
  return testEnv.authenticatedContext(SUPER_ADMIN, { role: "SUPER_ADMIN" }).firestore();
}
function customerA() {
  return testEnv.authenticatedContext(CUSTOMER_A).firestore();
}
function customerB() {
  return testEnv.authenticatedContext(CUSTOMER_B).firestore();
}
function anonymous() {
  return testEnv.unauthenticatedContext().firestore();
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
  // Seed with rules disabled — this is the "what the backend wrote"
  // starting state.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
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
    await setDoc(doc(db, "users", CUSTOMER_A), { name: "A", email: "a@example.com" });
    // What upsertStaffMember writes via the Admin SDK. Nothing below
    // is allowed to read it back or touch it from a client.
    await setDoc(doc(db, "staffInvites", "staff@example.com"), {
      email: "staff@example.com",
      role: "SUB_ADMIN",
      status: "active",
      superAdminId: SUPER_ADMIN,
      invitedBy: SUPER_ADMIN,
    });
  });
});

describe("reports authorization", () => {
  it("lets a customer read their own report metadata", async () => {
    await assertSucceeds(getDoc(doc(customerA(), "reports", "report-a")));
  });

  it("denies a customer reading another customer's report", async () => {
    await assertFails(getDoc(doc(customerA(), "reports", "report-b")));
  });

  it("denies an unauthenticated reader entirely", async () => {
    await assertFails(getDoc(doc(anonymous(), "reports", "report-a")));
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

  it("denies an ADMIN creating a report directly (functions-only now)", async () => {
    await assertFails(
      setDoc(doc(admin(), "reports", "forged"), {
        userId: CUSTOMER_B,
        status: "ready",
        updatedBy: ADMIN,
      })
    );
  });

  it("denies an ADMIN repointing an existing report's file", async () => {
    // This was the escalation path: rewrite report-a's file to point at
    // customer B's PDF, then customer A downloads it legitimately.
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

describe("role escalation", () => {
  it("denies a customer writing a role onto their own user document", async () => {
    await assertFails(
      updateDoc(doc(customerA(), "users", CUSTOMER_A), { role: "SUPER_ADMIN" })
    );
  });

  it("denies a customer creating a user document that carries a role", async () => {
    await assertFails(
      setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B", role: "ADMIN" })
    );
  });

  it("allows a customer to create their own profile without a role", async () => {
    await assertSucceeds(setDoc(doc(customerB(), "users", CUSTOMER_B), { name: "B" }));
  });

  it("denies a customer reading another customer's user document", async () => {
    await assertFails(getDoc(doc(customerB(), "users", CUSTOMER_A)));
  });
});

describe("coupons and media", () => {
  it("denies a customer reading the coupons collection", async () => {
    await assertFails(getDoc(doc(customerA(), "coupons", "coupon-1")));
  });

  it("lets an admin read coupons", async () => {
    await assertSucceeds(getDoc(doc(admin(), "coupons", "coupon-1")));
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

  it("lets an admin list the media library", async () => {
    await assertSucceeds(getDocs(collection(admin(), "mediaAssets")));
  });

  it("denies a customer reading the media library", async () => {
    await assertFails(getDoc(doc(customerA(), "mediaAssets", "asset-1")));
  });

  it("denies an admin writing a media record directly (functions-only)", async () => {
    await assertFails(
      setDoc(doc(admin(), "mediaAssets", "forged"), {
        publicId: "anything",
        category: "banners",
        updatedBy: ADMIN,
      })
    );
  });
});

describe("internal ledgers", () => {
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
  });
});

// The collection that decides who is an admin. Everything about it is
// Cloud-Function-only, so the interesting assertion is that literally
// no client context — customer, agent, admin, even SUPER_ADMIN — can
// read or write it. Frontend state, localStorage or a hand-crafted
// Firestore write therefore have no path to granting a role.
describe("staff role assignments (staffInvites)", () => {
  it("denies a customer creating a role assignment for themselves", async () => {
    await assertFails(
      setDoc(doc(customerA(), "staffInvites", "a@example.com"), {
        email: "a@example.com",
        role: "SUPER_ADMIN",
        status: "active",
      })
    );
  });

  it("denies a customer reading who has admin access", async () => {
    await assertFails(getDoc(doc(customerA(), "staffInvites", "staff@example.com")));
    await assertFails(getDocs(collection(customerA(), "staffInvites")));
  });

  it("denies an unauthenticated client entirely", async () => {
    await assertFails(getDoc(doc(anonymous(), "staffInvites", "staff@example.com")));
    await assertFails(setDoc(doc(anonymous(), "staffInvites", "x@example.com"), { role: "ADMIN" }));
  });

  it("denies an ADMIN promoting someone by writing here directly", async () => {
    // An ADMIN may not assign ADMIN or SUPER_ADMIN. The upsertStaffMember
    // function enforces that; this proves the direct-write bypass is
    // closed too, for every role including the ones they COULD assign.
    await assertFails(
      setDoc(doc(admin(), "staffInvites", "someone@example.com"), { role: "SUPER_ADMIN", status: "active" })
    );
    await assertFails(
      setDoc(doc(admin(), "staffInvites", "someone@example.com"), { role: "ADMIN", status: "active" })
    );
    await assertFails(
      setDoc(doc(admin(), "staffInvites", "someone@example.com"), { role: "COLLECTION_AGENT", status: "active" })
    );
  });

  it("denies even a SUPER_ADMIN writing or reading it directly", async () => {
    await assertFails(getDoc(doc(superAdmin(), "staffInvites", "staff@example.com")));
    await assertFails(
      setDoc(doc(superAdmin(), "staffInvites", "new@example.com"), { role: "ADMIN", status: "active" })
    );
  });

  it("denies a revoked staff member deleting their own revocation", async () => {
    await assertFails(deleteDoc(doc(admin(), "staffInvites", "staff@example.com")));
    await assertFails(
      updateDoc(doc(admin(), "staffInvites", "staff@example.com"), { status: "active" })
    );
  });
});

describe("role escalation through the users collection", () => {
  it("denies a customer adding a role to their own profile update", async () => {
    // The users document mirrors the role for listing/auditing, and
    // syncMyRole trusts it as a fallback for legacy staff accounts —
    // which is only safe because a client can never write that field.
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { role: "SUPER_ADMIN" }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { status: "active", role: "ADMIN" }));
  });

  it("denies a customer adding a hierarchy chain to their own profile", async () => {
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { superAdminId: CUSTOMER_A }));
    await assertFails(updateDoc(doc(customerA(), "users", CUSTOMER_A), { adminId: CUSTOMER_A }));
  });

  it("denies an ADMIN writing a role onto another user's document", async () => {
    await assertFails(updateDoc(doc(admin(), "users", CUSTOMER_A), { role: "ADMIN" }));
  });

  it("still allows a customer their ordinary profile edits", async () => {
    await assertSucceeds(updateDoc(doc(customerA(), "users", CUSTOMER_A), { name: "A Updated" }));
  });
});
