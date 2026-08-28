import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCampaign, createLead, updateCampaign, updateLead } from "@/services/adminMarketingService";

// Hoisted for the vi.mock factory. FakeFieldValue is a class instance
// like a real sentinel, so these tests also prove stripUndefined()
// forwards sentinels by reference rather than copying them.
const fs = vi.hoisted(() => {
  class FakeFieldValue {
    constructor(readonly kind: string) {}
  }
  return {
    DELETE_SENTINEL: new FakeFieldValue("deleteField"),
    SERVER_TS: new FakeFieldValue("serverTimestamp"),
    creates: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
  };
});

vi.mock("firebase/firestore", () => ({
  addDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    fs.creates.push(data);
    return { id: "generated-id" };
  },
  updateDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    fs.updates.push(data);
  },
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` }),
  deleteField: () => fs.DELETE_SENTINEL,
  serverTimestamp: () => fs.SERVER_TS,
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/firebase/firestore", () => ({ getDb: () => ({}) }));
vi.mock("@/firebase/functions", () => ({ callFunction: vi.fn() }));

const ACTOR = "admin-uid-1";

const lastCreate = () => fs.creates[fs.creates.length - 1];
const lastUpdate = () => fs.updates[fs.updates.length - 1];

function expectNoUndefinedValues(payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    expect(value, `field "${key}" must not be undefined`).not.toBeUndefined();
  }
}

beforeEach(() => {
  fs.creates.length = 0;
  fs.updates.length = 0;
});

describe("createCampaign", () => {
  const base = { name: "Diwali", type: "seasonal", startAt: "2026-10-01", endAt: "2026-10-31", status: "DRAFT" } as const;

  it("omits every blank optional field", async () => {
    await createCampaign(ACTOR, { ...base, description: "", offerId: "", couponId: "" });

    const payload = lastCreate();
    expect(payload).toEqual({
      name: "Diwali",
      type: "seasonal",
      startAt: "2026-10-01",
      endAt: "2026-10-31",
      status: "DRAFT",
      createdBy: ACTOR,
      updatedBy: ACTOR,
      createdAt: fs.SERVER_TS,
      updatedAt: fs.SERVER_TS,
    });
    expect("description" in payload).toBe(false);
    expect("offerId" in payload).toBe(false);
    expect("couponId" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });

  it("writes the optional fields that were filled in", async () => {
    await createCampaign(ACTOR, { ...base, description: "  Festive push  ", offerId: "offer-1", couponId: "" });

    const payload = lastCreate();
    expect(payload.description).toBe("Festive push");
    expect(payload.offerId).toBe("offer-1");
    expect("couponId" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });

  it("keeps the serverTimestamp sentinels intact", async () => {
    await createCampaign(ACTOR, base);
    expect(lastCreate().createdAt).toBe(fs.SERVER_TS);
    expect(lastCreate().updatedAt).toBe(fs.SERVER_TS);
  });
});

describe("updateCampaign", () => {
  it("unlinks an offer with deleteField() rather than an empty string", async () => {
    await updateCampaign(ACTOR, "camp-1", { name: "Diwali", offerId: "", couponId: "" });

    const payload = lastUpdate();
    expect(payload.offerId).toBe(fs.DELETE_SENTINEL);
    expect(payload.couponId).toBe(fs.DELETE_SENTINEL);
    expectNoUndefinedValues(payload);
  });

  it("sets an optional field that was filled in", async () => {
    await updateCampaign(ACTOR, "camp-1", { description: "Now with free home collection" });
    expect(lastUpdate().description).toBe("Now with free home collection");
  });

  // The pause/resume buttons send only a status; they must not wipe the
  // campaign's description or its linked offer as a side effect.
  it("touches nothing but status on a status-only patch", async () => {
    await updateCampaign(ACTOR, "camp-1", { status: "PAUSED" });

    const payload = lastUpdate();
    expect(payload).toEqual({ status: "PAUSED", updatedBy: ACTOR, updatedAt: fs.SERVER_TS });
    expect("description" in payload).toBe(false);
    expect("offerId" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });
});

describe("createLead", () => {
  it("omits a blank email and source", async () => {
    await createLead(ACTOR, { name: "Asha", phone: "9990001111", status: "NEW", email: "", source: "" });

    const payload = lastCreate();
    expect(payload).toEqual({
      name: "Asha",
      phone: "9990001111",
      status: "NEW",
      createdBy: ACTOR,
      updatedBy: ACTOR,
      createdAt: fs.SERVER_TS,
      updatedAt: fs.SERVER_TS,
    });
    expect("email" in payload).toBe(false);
    expect("source" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });

  it("writes an email and source that were provided", async () => {
    await createLead(ACTOR, {
      name: "Asha",
      phone: "9990001111",
      status: "NEW",
      email: "asha@example.com",
      source: "website",
    });

    const payload = lastCreate();
    expect(payload.email).toBe("asha@example.com");
    expect(payload.source).toBe("website");
    expectNoUndefinedValues(payload);
  });

  it("omits assignment fields nobody set, so the scoped read rules never see an empty uid", async () => {
    await createLead(ACTOR, { name: "Asha", phone: "9990001111", status: "NEW" });

    const payload = lastCreate();
    expect("assignedAdminId" in payload).toBe(false);
    expect("assignedSubAdminId" in payload).toBe(false);
    expect("assignedCollectionAgentId" in payload).toBe(false);
  });
});

describe("updateLead", () => {
  it("clears an assignment with deleteField()", async () => {
    await updateLead(ACTOR, "lead-1", { assignedCollectionAgentId: "" });
    expect(lastUpdate().assignedCollectionAgentId).toBe(fs.DELETE_SENTINEL);
  });

  it("reassigns to another uid", async () => {
    await updateLead(ACTOR, "lead-1", { assignedCollectionAgentId: "agent-9" });
    expect(lastUpdate().assignedCollectionAgentId).toBe("agent-9");
  });

  it("leaves untouched fields out of the patch", async () => {
    await updateLead(ACTOR, "lead-1", { status: "CONTACTED" });

    const payload = lastUpdate();
    expect(payload).toEqual({ status: "CONTACTED", updatedBy: ACTOR, updatedAt: fs.SERVER_TS });
    expectNoUndefinedValues(payload);
  });
});
