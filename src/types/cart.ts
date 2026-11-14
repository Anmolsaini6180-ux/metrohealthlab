// One item the customer has added to their cart, resolved at add-time
// against a specific lab's real lab_pricing row — the same real price
// create_website_booking_cart re-derives and verifies server-side from
// pricingRefId, exactly like the single-item flow it replaces.
export interface CartItem {
  itemType: "test" | "package";
  refId: string;
  name: string;
  price: number;
  mrp?: number;
  pricingRefId: string;
  labId: string;
  labName?: string;
}
