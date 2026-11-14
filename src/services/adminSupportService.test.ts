import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "support_tickets") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => {
          let filtered = state.rows;
          const builder = {
            eq(_col: string, value: unknown) {
              filtered = filtered.filter((r) => r.status === value);
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
              resolve({ data: filtered, error: null });
            },
          };
          return builder;
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            state.updates.push({ id, patch });
            const row = state.rows.find((r) => r.id === id);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const { getAllTickets, updateTicketStatus } = await import("@/services/adminSupportService");

function ticketRow(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: "t1",
    user_id: "user-1",
    booking_id: null,
    subject: "Where is my report?",
    message: "It has been 3 days.",
    status: "open",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    profiles: { name: "Asha Verma", email: "asha@example.invalid", phone: "+919990001111" },
    ...overrides,
  };
}

beforeEach(() => {
  state.rows = [];
  state.updates = [];
});

describe("getAllTickets", () => {
  it("flattens the joined customer profile onto the ticket", async () => {
    state.rows = [ticketRow({})];
    const [ticket] = await getAllTickets();
    expect(ticket.customerName).toBe("Asha Verma");
    expect(ticket.customerPhone).toBe("+919990001111");
    expect(ticket.subject).toBe("Where is my report?");
  });

  it("survives a ticket whose customer profile failed to join", async () => {
    state.rows = [ticketRow({ profiles: null })];
    const [ticket] = await getAllTickets();
    expect(ticket.customerName).toBeNull();
  });

  it("filters by status when one is requested", async () => {
    state.rows = [ticketRow({ id: "t1", status: "open" }), ticketRow({ id: "t2", status: "resolved" })];
    const open = await getAllTickets("open");
    expect(open.map((t) => t.id)).toEqual(["t1"]);
  });

  it("returns every ticket when no status filter is given", async () => {
    state.rows = [ticketRow({ id: "t1", status: "open" }), ticketRow({ id: "t2", status: "resolved" })];
    expect((await getAllTickets()).length).toBe(2);
  });
});

describe("updateTicketStatus", () => {
  it("writes the new status and bumps updated_at", async () => {
    state.rows = [ticketRow({ id: "t1", status: "open" })];
    await updateTicketStatus("t1", "resolved");
    expect(state.updates[0].patch.status).toBe("resolved");
    expect(state.updates[0].patch.updated_at).toBeTruthy();
  });
});
