// Service-role helpers used ONLY by the Supabase auth adapter's test
// suite (src/supabase/*.test.ts), to set up and tear down throwaway
// fixtures. Deliberately kept in scripts/migration/ rather than under
// src/ — nothing that reads a service-role key may live where the
// browser bundle could ever reach it. Test files import this module by
// relative path; it is never imported by application code.

import { loadSupabaseCredentials, redact } from "./credentials.mjs";

async function adminFetch(creds, path, init = {}) {
  const res = await fetch(`${creds.url}${path}`, {
    ...init,
    headers: { apikey: creds.key, authorization: `Bearer ${creds.key}`, "content-type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (HTTP ${res.status}): ${redact(text).slice(0, 300)}`);
  // PostgREST returns 201/204 with an EMPTY body unless
  // Prefer: return=representation was set — parsing "" as JSON throws,
  // so an empty body means "succeeded, nothing to return" rather than
  // an error.
  return text ? JSON.parse(text) : null;
}

let cachedCreds = null;
async function creds() {
  if (!cachedCreds) cachedCreds = await loadSupabaseCredentials();
  return cachedCreds;
}

/** Creates a pre-confirmed test auth user with a real password, so the
 * anon-key client can genuinely sign in with it — exercising the exact
 * path a real browser would use, not a mocked shortcut. */
export async function createConfirmedTestUser(email, password) {
  const c = await creds();
  const body = await adminFetch(c, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  return body.id ?? body.user?.id;
}

export async function deleteTestUser(userId) {
  const c = await creds();
  try {
    await adminFetch(c, `/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  } catch {
    // Already gone (e.g. cascade from a profiles delete) — fine.
  }
}

export async function upsertTestProfile(row) {
  const c = await creds();
  await adminFetch(c, "/rest/v1/profiles", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
}

export async function insertTestStaffRole(row) {
  const c = await creds();
  await adminFetch(c, "/rest/v1/staff_roles", { method: "POST", body: JSON.stringify([row]) });
}

export async function deleteTestStaffRole(userId) {
  const c = await creds();
  await adminFetch(c, `/rest/v1/staff_roles?user_id=eq.${userId}`, { method: "DELETE" });
}

/** Read-only. Never mutates app_config — the live master-admin mapping
 * is real data and no test fixture should ever touch it. */
export async function readMasterAdminUid() {
  const c = await creds();
  const rows = await adminFetch(c, "/rest/v1/app_config?key=eq.master_admin_uid&select=value");
  return rows[0]?.value ?? null;
}
