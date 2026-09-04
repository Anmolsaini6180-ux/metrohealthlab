import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the Supabase query-builder shape: .insert()/.update() capture
// exactly what create*/update* tried to write. created_by is a uuid FK
// resolved from the live Supabase session (auth.getUser()), never from
// the Firebase-shaped actorUid this file also carries for
// updated_by_firebase_uid provenance — see adminMarketingService.ts's
// currentSupabaseUserId().
const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  supabaseUserId: "11111111-1111-1111-1111-111111111111",
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: state.supabaseUserId } } }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "generated-id" }, error: null }) }) };
      },
      update: (row: Record<string, unknown>) => {
        state.updates.push(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

const { createCampaign, createLead, updateCampaign, updateLead } = await import("@/services/adminMarketingService");

const ACTOR = "admin-firebase-uid-1";

const lastInsert = () => state.inserts[state.inserts.length - 1];
const lastUpdate = () => state.updates[state.updates.length - 1];

beforeEach(() => {
  state.inserts.length = 0;
  state.updates.length = 0;
});

describe("createCampaign", () => {
  const base = { name: "Diwali", type: "seasonal", startAt: "2026-10-01", endAt: "2026-10-31", status: "DRAFT" } as const;

  it("writes null for every blank optional field", async () => {
    await createCampaign(ACTOR, { ...base, description: "", offerId: "", couponId: "" });

    const row = lastInsert();
    // id is a fresh crypto.randomUUID() per call — real bug this locks
    // in: campaigns.id has no database default, so the insert must set
    // one itself or every create fails with a 23502 not-null violation.
    expect(row).toEqual({
      id: expect.any(String),
      name: "Diwali",
      type: "seasonal",
      start_at: "2026-10-01",
      end_at: "2026-10-31",
      status: "DRAFT",
      description: null,
      offer_id: null,
      coupon_id: null,
      target_segment: null,
      created_by: state.supabaseUserId,
      updated_by_firebase_uid: ACTOR,
    });
  });

  it("writes the optional fields that were filled in", async () => {
    await createCampaign(ACTOR, { ...base, description: "  Festive push  ", offerId: "offer-1", couponId: "" });

    const row = lastInsert();
    expect(row.description).toBe("Festive push");
    expect(row.offer_id).toBe("offer-1");
    expect(row.coupon_id).toBeNull();
  });

  it("resolves created_by from the live Supabase session, not the Firebase actorUid", async () => {
    await createCampaign(ACTOR, base);
    expect(lastInsert().created_by).toBe(state.supabaseUserId);
    expect(lastInsert().updated_by_firebase_uid).toBe(ACTOR);
  });
});

describe("updateCampaign", () => {
  it("unlinks an offer by writing null rather than an empty string", async () => {
    await updateCampaign(ACTOR, "camp-1", { name: "Diwali", offerId: "", couponId: "" });

    const row = lastUpdate();
    expect(row.offer_id).toBeNull();
    expect(row.coupon_id).toBeNull();
  });

  it("sets an optional field that was filled in", async () => {
    await updateCampaign(ACTOR, "camp-1", { description: "Now with free home collection" });
    expect(lastUpdate().description).toBe("Now with free home collection");
  });

  // The pause/resume buttons send only a status; they must not wipe the
  // campaign's description or its linked offer as a side effect.
  it("touches nothing but status on a status-only patch", async () => {
    await updateCampaign(ACTOR, "camp-1", { status: "PAUSED" });

    const row = lastUpdate();
    expect(row.status).toBe("PAUSED");
    expect(row.updated_by_firebase_uid).toBe(ACTOR);
    expect("description" in row).toBe(false);
    expect("offer_id" in row).toBe(false);
  });
});

describe("createLead", () => {
  it("writes null for a blank email and source", async () => {
    await createLead(ACTOR, { name: "Asha", phone: "9990001111", status: "NEW", email: "", source: "" });

    const row = lastInsert();
    // Same real bug as createCampaign above: leads.id has no database
    // default either.
    expect(row).toEqual({
      id: expect.any(String),
      name: "Asha",
      phone: "9990001111",
      status: "NEW",
      email: null,
      source: null,
      campaign_id: null,
      assigned_admin_id: null,
      assigned_sub_admin_id: null,
      assigned_collection_agent_id: null,
      created_by: state.supabaseUserId,
      updated_by_firebase_uid: ACTOR,
    });
  });

  it("writes an email and source that were provided", async () => {
    await createLead(ACTOR, {
      name: "Asha",
      phone: "9990001111",
      status: "NEW",
      email: "asha@example.com",
      source: "website",
    });

    const row = lastInsert();
    expect(row.email).toBe("asha@example.com");
    expect(row.source).toBe("website");
  });

  it("writes null assignment fields nobody set", async () => {
    await createLead(ACTOR, { name: "Asha", phone: "9990001111", status: "NEW" });

    const row = lastInsert();
    expect(row.assigned_admin_id).toBeNull();
    expect(row.assigned_sub_admin_id).toBeNull();
    expect(row.assigned_collection_agent_id).toBeNull();
  });
});

describe("updateLead", () => {
  it("clears an assignment by writing null", async () => {
    await updateLead(ACTOR, "lead-1", { assignedCollectionAgentId: "" });
    expect(lastUpdate().assigned_collection_agent_id).toBeNull();
  });

  it("reassigns to another uid", async () => {
    await updateLead(ACTOR, "lead-1", { assignedCollectionAgentId: "agent-9" });
    expect(lastUpdate().assigned_collection_agent_id).toBe("agent-9");
  });

  it("leaves untouched fields out of the patch", async () => {
    await updateLead(ACTOR, "lead-1", { status: "CONTACTED" });

    const row = lastUpdate();
    expect(row.status).toBe("CONTACTED");
    expect(row.updated_by_firebase_uid).toBe(ACTOR);
    expect("name" in row).toBe(false);
    expect("phone" in row).toBe(false);
  });
});
