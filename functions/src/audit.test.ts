import { describe, expect, it, vi } from "vitest";

// audit.ts imports ./admin, which calls initializeApp() at module load.
// Stub it so the payload builder can be tested without a Firebase app.
vi.mock("./admin", () => ({ db: { collection: () => ({ doc: () => ({}), add: async () => ({ id: "x" }) }) } }));

const { auditLogPayload } = await import("./audit");

function undefinedKeys(payload: Record<string, unknown>): string[] {
  return Object.entries(payload)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);
}

describe("auditLogPayload", () => {
  // The catalog triggers derive actorId from a document's `updatedBy`
  // field. A record written outside the admin panel has none, and the
  // Admin SDK rejects an explicitly-undefined value.
  it("omits actorId entirely when the author is unknown", () => {
    const payload = auditLogPayload({
      action: "test.updated",
      actorType: "staff",
      actorId: undefined,
      targetType: "test",
      targetId: "test-1",
      metadata: { before: null, after: { name: "CBC" } },
    });

    expect("actorId" in payload).toBe(false);
    expect(undefinedKeys(payload)).toEqual([]);
  });

  it("keeps actorId when it is known", () => {
    const payload = auditLogPayload({
      action: "test.updated",
      actorType: "staff",
      actorId: "admin-1",
      targetType: "test",
      targetId: "test-1",
    });

    expect(payload.actorId).toBe("admin-1");
    expect(undefinedKeys(payload)).toEqual([]);
  });

  it("omits metadata when a caller has none, rather than writing undefined", () => {
    const payload = auditLogPayload({
      action: "payment.cash_pending",
      actorType: "customer",
      actorId: "cust-1",
      targetType: "booking",
      targetId: "MH-1",
    });

    expect("metadata" in payload).toBe(false);
    expect(undefinedKeys(payload)).toEqual([]);
  });

  it("carries the required fields through unchanged", () => {
    const payload = auditLogPayload({
      action: "webhook.unknown_order",
      actorType: "webhook",
      targetType: "razorpayOrder",
      targetId: "order_123",
      metadata: { event: "payment.captured" },
    });

    expect(payload.action).toBe("webhook.unknown_order");
    expect(payload.actorType).toBe("webhook");
    expect(payload.targetType).toBe("razorpayOrder");
    expect(payload.targetId).toBe("order_123");
    expect(payload.metadata).toEqual({ event: "payment.captured" });
    expect(payload.createdAt).toBeDefined();
    expect(undefinedKeys(payload)).toEqual([]);
  });
});
