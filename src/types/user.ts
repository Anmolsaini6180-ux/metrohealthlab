export interface UserProfile {
  id: string; // matches Firebase Auth uid
  name?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  preferences?: Record<string, unknown>;
  defaultAddressId?: string;
  // Explicit marker so admin queries (segments, customer list) can
  // distinguish real customers from staff accounts without relying on
  // the absence of a `role` field. Staff accounts (created via
  // createTeamMember) never set this.
  accountType?: "customer";
  createdAt: unknown;
  updatedAt: unknown;
}
