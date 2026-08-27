import { defineString } from "firebase-functions/params";
import { normalizeEmail } from "./roleClaims";

// The single configurable MASTER ADMIN EMAIL.
//
// Whichever Google/Firebase account signs in with this exact email is
// granted SUPER_ADMIN, server-side, by syncMyRole. That is the ONLY
// way a SUPER_ADMIN ever comes into existence — no bootstrap secret,
// no setup page, no client-supplied input anywhere in the decision.
//
// This is deliberately a plain (non-secret) deploy parameter rather
// than a Secret Manager secret:
//   * an email address is an identity, not a credential — knowing it
//     grants nothing, since you still have to prove ownership of that
//     Google account to Firebase Auth;
//   * defineString resolves from the function's ordinary environment,
//     so it works on any plan and needs no `functions:secrets:set`.
//
// Configure it in ONE of these ways (first match wins):
//   1. functions/.env            — MASTER_ADMIN_EMAIL=you@gmail.com
//      (git-ignored; use functions/.env.example as the template)
//   2. functions/.env.<projectId>  — e.g. functions/.env.metro-health-0001
//   3. leave both unset and this committed default applies.
//
// It must NEVER be mirrored into a VITE_* variable: the frontend has
// no business deciding who is an admin.
const masterAdminEmail = defineString("MASTER_ADMIN_EMAIL", {
  default: "anmolsaini6180@gmail.com",
  description: "Email address that is automatically granted SUPER_ADMIN on sign-in.",
});

export function getMasterAdminEmail(): string {
  return normalizeEmail(masterAdminEmail.value());
}

// Pure comparison, split out from the param lookup so it can be tested
// without a deployed environment.
export function isMasterAdminEmail(email: unknown, masterEmail: unknown): boolean {
  const candidate = normalizeEmail(email);
  const master = normalizeEmail(masterEmail);
  if (!candidate || !master) return false;
  return candidate === master;
}
