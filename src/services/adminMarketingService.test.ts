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
  rpcResult: null as unknown,
  rpcError: null as unknown,
  lastRpc: null as { name: string; args: Record<string, unknown> } | null,
  filters: [] as { column: string; op: string; value: unknown }[],
  leadRows: [] as { id: string; phone: string }[],
  profileRows: [] as { id: string; phone: string | null }[],
  lastBroadcast: null as Record<string, unknown> | null,
  broadcastResult: { recipientCount: 0 },
}));

vi.mock("@/services/adminOpsService", () => ({
  sendBroadcastNotification: async (payload: Record<string, unknown>) => {
    state.lastBroadcast = payload;
    return state.broadcastResult;
  },
}));

function bookingsQuery() {
  const rows = [
    { id: "bk-1", date: "2026-09-01", final_amount: 1999, contact: { name: "Asha Rao", phone: "9990001111" } },
  ];
  const builder = {
    filter: (column: string, op: string, value: unknown) => {
      state.filters.push({ column, op, value });
      return builder;
    },
    order: () => builder,
    limit: async () => ({ data: column_matches() ? rows : [], error: null }),
  };
  function column_matches() {
    const last = state.filters[state.filters.length - 1];
    if (!last) return false;
    const needle = String(last.value).replace(/%/g, "").toLowerCase();
    if (last.column === "contact->>phone") return rows[0].contact.phone.includes(needle);
    if (last.column === "contact->>name") return rows[0].contact.name.toLowerCase().includes(needle);
    return false;
  }
  return builder;
}

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: state.supabaseUserId } } }),
    },
    from: (table: string) => {
      if (table === "bookings") return { select: () => bookingsQuery() };
      if (table === "profiles") return { select: () => ({ not: () => ({ limit: async () => ({ data: state.profileRows, error: null }) }) }) };
      return {
        // sendBulkNotificationToLeads' own lookup (leads.select().in())
        // — every other caller here (createLead/updateLead/campaigns)
        // uses insert/update below instead, never select, so this can
        // safely live on the same shared fallback branch.
        select: () => ({ in: async () => ({ data: state.leadRows, error: null }) }),
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "generated-id" }, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          state.updates.push(row);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.lastRpc = { name, args };
      return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
    },
  }),
}));

const {
  createCampaign,
  createLead,
  updateCampaign,
  updateLead,
  getCampaignPerformance,
  searchBookingsForLeadLink,
  sendBulkNotificationToLeads,
} = await import("@/services/adminMarketingService");

const ACTOR = "admin-firebase-uid-1";

const lastInsert = () => state.inserts[state.inserts.length - 1];
const lastUpdate = () => state.updates[state.updates.length - 1];

beforeEach(() => {
  state.inserts.length = 0;
  state.updates.length = 0;
  state.filters.length = 0;
  state.rpcResult = null;
  state.rpcError = null;
  state.lastRpc = null;
  state.leadRows = [];
  state.profileRows = [];
  state.lastBroadcast = null;
  state.broadcastResult = { recipientCount: 0 };
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
      planned_budget: null,
      daily_budget: null,
      area: null,
      age_group: null,
      gender: null,
      target_offering: null,
      whatsapp_message: null,
      cta_text: null,
      cta_link: null,
      landing_page: null,
      created_by: state.supabaseUserId,
      updated_by_firebase_uid: ACTOR,
    });
  });

  it("writes the targeting, budget and creative fields when provided", async () => {
    await createCampaign(ACTOR, {
      ...base,
      plannedBudget: 20000,
      dailyBudget: 500,
      area: "Andheri West",
      ageGroup: "25-40",
      gender: "All",
      targetOffering: "Full Body Checkup package",
      whatsappMessage: "Flat 20% off this Diwali!",
      ctaText: "Book Now",
      ctaLink: "/packages/full-body-checkup",
      landingPage: "/offers/diwali",
    });

    const row = lastInsert();
    expect(row.planned_budget).toBe(20000);
    expect(row.daily_budget).toBe(500);
    expect(row.area).toBe("Andheri West");
    expect(row.age_group).toBe("25-40");
    expect(row.gender).toBe("All");
    expect(row.target_offering).toBe("Full Body Checkup package");
    expect(row.whatsapp_message).toBe("Flat 20% off this Diwali!");
    expect(row.cta_text).toBe("Book Now");
    expect(row.cta_link).toBe("/packages/full-body-checkup");
    expect(row.landing_page).toBe("/offers/diwali");
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

  // Omitted (not 0, not null) so a create that doesn't mention spend at
  // all leaves the database's own `default 0` in place, same as every
  // other optional field's undefined-means-omit convention here.
  it("omits spend entirely when not provided, rather than writing 0 or null", async () => {
    await createCampaign(ACTOR, base);
    expect("spend" in lastInsert()).toBe(false);
  });

  it("writes a real ad-spend figure when provided", async () => {
    await createCampaign(ACTOR, { ...base, spend: 4999.5 });
    expect(lastInsert().spend).toBe(4999.5);
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

  it("updates ad spend when provided, and leaves it untouched otherwise", async () => {
    await updateCampaign(ACTOR, "camp-1", { spend: 12500 });
    expect(lastUpdate().spend).toBe(12500);

    await updateCampaign(ACTOR, "camp-1", { description: "unrelated edit" });
    expect("spend" in lastUpdate()).toBe(false);
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
      booking_id: null,
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

  it("links a lead to the real booking it converted into", async () => {
    await updateLead(ACTOR, "lead-1", { bookingId: "bk-1", status: "CONVERTED" });
    const row = lastUpdate();
    expect(row.booking_id).toBe("bk-1");
    expect(row.status).toBe("CONVERTED");
  });

  it("unlinks a booking by writing null", async () => {
    await updateLead(ACTOR, "lead-1", { bookingId: "" });
    expect(lastUpdate().booking_id).toBeNull();
  });
});

describe("searchBookingsForLeadLink", () => {
  it("returns nothing for a query shorter than 3 characters, without querying at all", async () => {
    const results = await searchBookingsForLeadLink("99");
    expect(results).toEqual([]);
    expect(state.filters.length).toBe(0);
  });

  it("finds a booking by phone and shapes a human-readable customer label", async () => {
    const results = await searchBookingsForLeadLink("9990001111");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: "bk-1", date: "2026-09-01", finalAmount: 1999, customerLabel: "Asha Rao • 9990001111" });
  });

  it("finds the same booking by name without double-counting it", async () => {
    const results = await searchBookingsForLeadLink("Asha");
    expect(results).toHaveLength(1);
  });
});

describe("getCampaignPerformance", () => {
  it("maps a real campaign row, including its ROI figures", async () => {
    state.rpcResult = [
      {
        id: "camp-1", name: "Diwali", status: "RUNNING", spend: 8000,
        leads: 40, converted: 10, bookings: 10, revenue: 45000, tp: 21000, tpUnknown: 0,
        grossMargin: 24000, profit: 16000, roi: 200, conversionRate: 25, costPerLead: 200, costPerBooking: 800,
      },
    ];
    const rows = await getCampaignPerformance("2026-09-01", "2026-09-30");
    expect(state.lastRpc).toEqual({ name: "get_campaign_performance", args: { p_start: "2026-09-01", p_end: "2026-09-30" } });
    expect(rows).toEqual([
      {
        id: "camp-1", name: "Diwali", status: "RUNNING", spend: 8000,
        leads: 40, converted: 10, bookings: 10, revenue: 45000, tp: 21000, tpUnknown: 0,
        grossMargin: 24000, profit: 16000, roi: 200, conversionRate: 25, costPerLead: 200, costPerBooking: 800,
      },
    ]);
  });

  it("keeps ROI/conversion/cost figures as null rather than inventing a 0 or Infinity when a campaign has zero spend or zero leads", async () => {
    state.rpcResult = [
      { id: "camp-2", name: "Organic", status: "DRAFT", spend: 0, leads: 0, converted: 0, bookings: 0, revenue: 0, tp: 0, tpUnknown: 0, grossMargin: 0, profit: 0, roi: null, conversionRate: null, costPerLead: null, costPerBooking: null },
    ];
    const [row] = await getCampaignPerformance();
    expect(row.roi).toBeNull();
    expect(row.conversionRate).toBeNull();
    expect(row.costPerLead).toBeNull();
    expect(row.costPerBooking).toBeNull();
  });

  it("passes null for an omitted date range (lifetime performance)", async () => {
    state.rpcResult = [];
    await getCampaignPerformance();
    expect(state.lastRpc).toEqual({ name: "get_campaign_performance", args: { p_start: null, p_end: null } });
  });
});

describe("sendBulkNotificationToLeads", () => {
  const NOTIFICATION = { type: "offer" as const, title: "Diwali offer", message: "Flat 20% off this week." };

  it("returns all-zero without querying anything when given no lead ids", async () => {
    const result = await sendBulkNotificationToLeads([], NOTIFICATION);
    expect(result).toEqual({ totalLeads: 0, matched: 0, unmatched: 0, recipientCount: 0 });
    expect(state.lastBroadcast).toBeNull();
  });

  it("matches leads to registered customers by phone (ignoring formatting) and sends only to those", async () => {
    state.leadRows = [
      { id: "lead-1", phone: "+91 99900 01111" },
      { id: "lead-2", phone: "9990002222" },
    ];
    state.profileRows = [{ id: "user-1", phone: "9990001111" }];
    state.broadcastResult = { recipientCount: 1 };

    const result = await sendBulkNotificationToLeads(["lead-1", "lead-2"], NOTIFICATION);

    expect(result).toEqual({ totalLeads: 2, matched: 1, unmatched: 1, recipientCount: 1 });
    expect(state.lastBroadcast).toEqual({
      audience: "selected",
      customerUids: ["user-1"],
      type: "offer",
      title: "Diwali offer",
      message: "Flat 20% off this week.",
      imageUrl: undefined,
      actionUrl: undefined,
    });
  });

  it("never calls the broadcast RPC at all when not one lead matches a real account", async () => {
    state.leadRows = [{ id: "lead-1", phone: "9990001111" }];
    state.profileRows = [];

    const result = await sendBulkNotificationToLeads(["lead-1"], NOTIFICATION);

    expect(result).toEqual({ totalLeads: 1, matched: 0, unmatched: 1, recipientCount: 0 });
    expect(state.lastBroadcast).toBeNull();
  });

  it("dedupes when two matched leads share the same underlying customer account", async () => {
    state.leadRows = [
      { id: "lead-1", phone: "9990001111" },
      { id: "lead-2", phone: "9990001111" },
    ];
    state.profileRows = [{ id: "user-1", phone: "9990001111" }];
    state.broadcastResult = { recipientCount: 1 };

    const result = await sendBulkNotificationToLeads(["lead-1", "lead-2"], NOTIFICATION);
    expect(result.matched).toBe(2);
    expect((state.lastBroadcast!.customerUids as string[]).length).toBe(1);
  });
});
