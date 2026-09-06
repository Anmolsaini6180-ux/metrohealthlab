import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks only what getTeamPerformance actually calls: a `bookings`
// assignment-scan, a `cash_collections` scan joined to bookings.date,
// and a `profiles` name lookup keyed by whichever uids either scan
// turned up.
const state = vi.hoisted(() => ({
  bookingRows: [] as Record<string, unknown>[],
  cashRows: [] as Record<string, unknown>[],
  profileRows: [] as Record<string, unknown>[],
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            gte: () => ({ lte: () => ({ limit: async () => ({ data: state.bookingRows, error: null }) }) }),
          }),
        };
      }
      if (table === "cash_collections") {
        return {
          select: () => ({
            gte: () => ({ lte: () => ({ limit: async () => ({ data: state.cashRows, error: null }) }) }),
          }),
        };
      }
      if (table === "profiles") {
        return { select: () => ({ in: async () => ({ data: state.profileRows, error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { getTeamPerformance } = await import("@/services/adminPerformanceService");

beforeEach(() => {
  state.bookingRows = [];
  state.cashRows = [];
  state.profileRows = [];
});

describe("getTeamPerformance", () => {
  it("credits assigned/completed/pending/cancelled from the booking assignment columns", async () => {
    state.bookingRows = [
      { assigned_agent_id: "agent-1", assigned_admin_id: null, assigned_sub_admin_id: null, booking_status: "completed" },
      { assigned_agent_id: "agent-1", assigned_admin_id: null, assigned_sub_admin_id: null, booking_status: "confirmed" },
    ];
    state.profileRows = [{ id: "agent-1", name: "Ravi Kumar", email: "ravi@example.com" }];

    const result = await getTeamPerformance("2026-09-01", "2026-09-30");
    expect(result.performance).toEqual([
      { uid: "agent-1", name: "Ravi Kumar", assigned: 2, completed: 1, pending: 1, cancelled: 0, completionRate: 50, cashCollected: 0 },
    ]);
  });

  it("sums new_amount - previous_amount per cash_collections row, not new_amount alone, so two partial recordings add up correctly", async () => {
    state.bookingRows = [{ assigned_agent_id: "agent-1", assigned_admin_id: null, assigned_sub_admin_id: null, booking_status: "confirmed" }];
    state.cashRows = [
      { recorded_by: "agent-1", previous_amount: 0, new_amount: 500, bookings: { date: "2026-09-05" } },
      { recorded_by: "agent-1", previous_amount: 500, new_amount: 1999, bookings: { date: "2026-09-06" } },
    ];
    state.profileRows = [{ id: "agent-1", name: "Ravi Kumar", email: "ravi@example.com" }];

    const result = await getTeamPerformance("2026-09-01", "2026-09-30");
    expect(result.performance[0].cashCollected).toBe(1999);
  });

  it("credits cash to whoever actually recorded it, even with zero bookings assigned to them in range", async () => {
    state.bookingRows = [];
    state.cashRows = [{ recorded_by: "admin-9", previous_amount: 0, new_amount: 2499, bookings: { date: "2026-09-05" } }];
    state.profileRows = [{ id: "admin-9", name: "Office Admin", email: "office@example.com" }];

    const result = await getTeamPerformance("2026-09-01", "2026-09-30");
    expect(result.performance).toEqual([
      { uid: "admin-9", name: "Office Admin", assigned: 0, completed: 0, pending: 0, cancelled: 0, completionRate: 0, cashCollected: 2499 },
    ]);
  });

  it("reports cashCollected as a real 0, not omitted, for a staff member with assignments but no cash collected", async () => {
    state.bookingRows = [{ assigned_agent_id: "agent-2", assigned_admin_id: null, assigned_sub_admin_id: null, booking_status: "confirmed" }];
    state.profileRows = [{ id: "agent-2", name: "New Agent", email: "new@example.com" }];

    const result = await getTeamPerformance("2026-09-01", "2026-09-30");
    expect(result.performance[0].cashCollected).toBe(0);
  });
});
