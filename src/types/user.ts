export interface UserProfile {
  // The Supabase profiles.id (a real uuid) once a Supabase session is
  // linked; falls back to the Firebase uid only for a phone-only
  // account, which has no Supabase session to own a row with — see
  // userService.ts's header comment.
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  // Explicit marker so admin queries (segments, customer list) can
  // distinguish real customers from staff accounts without relying on
  // the absence of a `role` field. Staff accounts (created via
  // createTeamMember) never set this.
  accountType?: "customer";
  createdAt: unknown;
  updatedAt: unknown;
}
