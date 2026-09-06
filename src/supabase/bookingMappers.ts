import type { Booking, BookingItem, BookingStatusHistoryEntry } from "@/types/booking";

/** A `bookings` row selected with its `booking_items(*)` embedded
 * (`.select("*, booking_items(*)")`). */
export function rowToBooking(r: Record<string, unknown>): Booking {
  const items = (r.booking_items as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: r.id as string,
    reference: (r.reference as string) ?? "",
    startAt: (r.start_at as string) ?? undefined,
    userId: (r.user_id as string) ?? "",
    patientId: (r.patient_id as string) ?? "",
    items: items.map(
      (i): BookingItem => ({
        itemType: i.item_type as BookingItem["itemType"],
        refId: i.ref_id as string,
        name: i.name as string,
        labId: (i.lab_id as string) ?? "",
        price: Number(i.price ?? 0),
        // Absent ("tp" not in i) on the customer-facing BOOKING_SELECT
        // in bookingService.ts, which never queries this column.
        tp: "tp" in i ? (i.tp == null ? null : Number(i.tp)) : undefined,
      })
    ),
    labId: (r.lab_id as string) ?? "",
    labName: (r.lab_name as string) ?? undefined,
    contact: (r.contact as Booking["contact"]) ?? undefined,
    collectionType: r.collection_type as Booking["collectionType"],
    addressId: (r.address_id as string) ?? undefined,
    date: r.date as string,
    slotId: (r.slot_id as string) ?? "",
    couponId: (r.coupon_id as string) ?? undefined,
    subtotal: Number(r.subtotal ?? 0),
    collectionFee: Number(r.collection_fee ?? 0),
    discount: Number(r.discount ?? 0),
    finalAmount: Number(r.final_amount ?? 0),
    amountReceived: Number(r.amount_received ?? 0),
    pendingAmount: Number(r.pending_amount ?? 0),
    paymentMethod: (r.payment_method as Booking["paymentMethod"]) ?? undefined,
    source: (r.source as Booking["source"]) ?? undefined,
    paymentStatus: r.payment_status as Booking["paymentStatus"],
    bookingStatus: r.booking_status as Booking["bookingStatus"],
    assignedAgentId: (r.assigned_agent_id as string) ?? undefined,
    assignedSubAdminId: (r.assigned_sub_admin_id as string) ?? undefined,
    assignedAdminId: (r.assigned_admin_id as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToBookingStatusHistory(r: Record<string, unknown>): BookingStatusHistoryEntry {
  return {
    id: r.id as string,
    bookingId: r.booking_id as string,
    status: r.status as BookingStatusHistoryEntry["status"],
    note: (r.note as string) ?? undefined,
    createdAt: r.created_at,
  };
}
