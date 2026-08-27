import { callFunction } from "@/firebase/functions";
import type { UserProfile } from "@/types/user";
import type { Booking } from "@/types/booking";
import type { Patient } from "@/types/patient";
import type { Address } from "@/types/address";
import type { Report } from "@/types/report";

export interface AdminCustomerSummary extends UserProfile {
  uid: string;
}

export async function getAdminCustomers(params: { searchName?: string; cursorUid?: string }): Promise<{
  customers: AdminCustomerSummary[];
  hasMore: boolean;
  approximate?: boolean;
}> {
  return callFunction("getAdminCustomers", params);
}

export interface CustomerDetail {
  profile: AdminCustomerSummary;
  bookings: Booking[];
  patients: Patient[];
  addresses: Address[];
  reports: Report[];
}

export async function getCustomerDetail(customerUid: string): Promise<CustomerDetail> {
  return callFunction<{ customerUid: string }, CustomerDetail>("getCustomerDetail", { customerUid });
}
