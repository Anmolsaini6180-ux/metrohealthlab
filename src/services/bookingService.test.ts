import { describe, expect, it, vi } from "vitest";

// Regression test for the tp/margin migration: booking_items now has
// an internal-cost column, and this file is the CUSTOMER-facing
// booking read path (see its own header comment). The security
// boundary here isn't "the UI doesn't render tp" — a customer
// legitimately has RLS access to their own booking_items rows, so
// only never asking Postgres for that column in the first place keeps
// it out of the response. adminBookingService.ts/adminCustomerService.ts
// keep their own separate `booking_items(*)`, deliberately, for staff.
const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  lastSelect: "" as string,
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: (columns: string) => {
        state.lastSelect = columns;
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: state.row, error: null }),
          }),
        };
      },
    }),
  }),
}));

const { getBookingById } = await import("@/services/bookingService");

const BASE_ROW = {
  id: "MH260904ABCDE",
  user_id: "user-1",
  patient_id: "patient-1",
  contact: { name: "Test Customer", phone: "9999999999" },
  collection_type: "home",
  date: "2026-09-10",
  slot_id: "slot-1",
  subtotal: 1599,
  collection_fee: 0,
  discount: 0,
  final_amount: 1599,
  amount_received: 0,
  payment_status: "pending",
  booking_status: "confirmed",
  created_at: "2026-09-04T00:00:00Z",
  updated_at: "2026-09-04T00:00:00Z",
  booking_items: [
    // No `tp` key at all — exactly what a real query against the
    // explicit customer-facing column list actually returns.
    { id: "item-1", booking_id: "MH260904ABCDE", item_type: "package", ref_id: "pkg-1", name: "Full Body Checkup", lab_id: "lab-1", price: 1599 },
  ],
};

describe("bookingService customer read — tp exposure", () => {
  it("never requests the booking_items.tp column, and not via a wildcard either", async () => {
    state.row = BASE_ROW;
    await getBookingById(BASE_ROW.id);
    expect(state.lastSelect).not.toContain("tp");
    expect(state.lastSelect).not.toMatch(/booking_items\(\s*\*\s*\)/);
  });

  it("never carries tp on the mapped booking item", async () => {
    state.row = BASE_ROW;
    const booking = await getBookingById(BASE_ROW.id);
    expect(booking?.items[0]?.tp).toBeUndefined();
    expect(JSON.stringify(booking)).not.toContain('"tp"');
  });
});
