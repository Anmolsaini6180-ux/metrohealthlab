// Supabase-backed. profiles_select_own already lets can_manage_catalog()
// staff (SUPER_ADMIN/ADMIN) read every profile, and patients/addresses/
// reports carry the identical staff-visibility clause -- the same
// boundary the getAdminCustomers/getCustomerDetail Cloud Functions were
// meant to enforce, and never did (never deployed on Spark).
import { getSupabaseClient } from "@/supabase/client";
import { rowToAddress, rowToPatient } from "@/supabase/mappers";
import { rowToBooking } from "@/supabase/bookingMappers";
import type { UserProfile } from "@/types/user";
import type { Booking } from "@/types/booking";
import type { Patient } from "@/types/patient";
import type { Address } from "@/types/address";
import type { Report } from "@/types/report";

export interface AdminCustomerSummary extends UserProfile {
  uid: string;
}

function rowToCustomerSummary(r: Record<string, unknown>): AdminCustomerSummary {
  return {
    uid: r.id as string,
    id: r.id as string,
    name: (r.name as string) ?? "",
    email: (r.email as string) ?? "",
    phone: (r.phone as string) ?? undefined,
    photoUrl: (r.photo_url as string) ?? undefined,
    dateOfBirth: (r.date_of_birth as string) ?? undefined,
    gender: (r.gender as UserProfile["gender"]) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as AdminCustomerSummary;
}

export async function getAdminCustomers(params: { searchName?: string; cursorUid?: string }): Promise<{
  customers: AdminCustomerSummary[];
  hasMore: boolean;
  approximate?: boolean;
}> {
  const LIMIT = 50;
  let query = getSupabaseClient().from("profiles").select("*").order("created_at", { ascending: false }).limit(LIMIT + 1);
  if (params.searchName) query = query.or(`name.ilike.%${params.searchName}%,email.ilike.%${params.searchName}%,phone.ilike.%${params.searchName}%`);
  if (params.cursorUid) query = query.lt("id", params.cursorUid);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > LIMIT;
  return { customers: (hasMore ? rows.slice(0, LIMIT) : rows).map(rowToCustomerSummary), hasMore };
}

export interface CustomerDetail {
  profile: AdminCustomerSummary;
  bookings: Booking[];
  patients: Patient[];
  addresses: Address[];
  reports: Report[];
}

export async function getCustomerDetail(customerUid: string): Promise<CustomerDetail> {
  const client = getSupabaseClient();
  const [{ data: profile, error: profileError }, { data: bookingRows, error: bookingError }, { data: patientRows, error: patientError }, { data: addressRows, error: addressError }, { data: reportRows, error: reportError }] =
    await Promise.all([
      client.from("profiles").select("*").eq("id", customerUid).maybeSingle(),
      client.from("bookings").select("*, booking_items(*)").eq("user_id", customerUid).order("created_at", { ascending: false }),
      client.from("patients").select("*").eq("user_id", customerUid),
      client.from("addresses").select("*").eq("user_id", customerUid),
      client.from("reports").select("*").eq("user_id", customerUid).order("created_at", { ascending: false }),
    ]);
  if (profileError) throw profileError;
  if (!profile) throw new Error("That customer no longer exists.");
  if (bookingError) throw bookingError;
  if (patientError) throw patientError;
  if (addressError) throw addressError;
  if (reportError) throw reportError;

  return {
    profile: rowToCustomerSummary(profile),
    bookings: (bookingRows ?? []).map(rowToBooking),
    patients: (patientRows ?? []).map(rowToPatient),
    addresses: (addressRows ?? []).map(rowToAddress),
    reports: (reportRows ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      patientId: r.patient_id ?? "",
      bookingId: r.booking_id ?? "",
      testId: r.test_id ?? undefined,
      packageId: r.package_id ?? undefined,
      labId: r.lab_id ?? "",
      status: r.status,
      storageProvider: r.storage_provider ?? undefined,
      publicId: r.public_id ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }) as Report),
  };
}
