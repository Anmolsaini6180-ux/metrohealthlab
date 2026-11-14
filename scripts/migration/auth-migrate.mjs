// Firebase Auth -> Supabase Auth identity migration.
//
// DEFAULT MODE IS --dry-run. Nothing is written to Supabase or Firebase
// unless --apply is passed explicitly, and even then:
//   - Firebase Auth is NEVER written to (no create/update/disable/delete
//     call exists anywhere in this file or its imports)
//   - every write is idempotent: a firebase_uid already present in
//     public.profiles is skipped, never re-created
//   - matching is by firebase_uid only, never by email or phone
//   - the master admin never gets a staff_roles row (mirrors the
//     Firestore rule that a stored "SUPER_ADMIN" is never honoured);
//     their authority is set via app_config.master_admin_uid instead
//   - a staff_roles row is only inserted once every uid in its
//     ownership chain has already been resolved to a Supabase uuid
//
// Usage:
//   node scripts/migration/auth-migrate.mjs --dry-run
//   node scripts/migration/auth-migrate.mjs --apply     (NOT run by the
//                                                         assistant without
//                                                         your explicit go-ahead)

import { loadServiceAccount, getAccessToken, loadSupabaseCredentials, redact } from "./lib/credentials.mjs";
import { buildMigrationPlan, resolveOwnershipChain, chainIsResolved, assignedRole } from "./lib/authPlan.mjs";

const AUTH_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";
const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

async function fetchAllAuthUsers(projectId, token) {
  const users = [];
  let nextPageToken;
  for (;;) {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`);
    url.searchParams.set("maxResults", "1000");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`accounts:batchGet returned HTTP ${res.status}`);
    const body = await res.json();
    users.push(...(body.users ?? []));
    if (!body.nextPageToken || (body.users ?? []).length === 0) break;
    nextPageToken = body.nextPageToken;
  }
  return users;
}

/** Reads the one bootstrap document. Read-only single GET. */
async function fetchMasterAdminUid(projectId, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system/config`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`Could not read system/config (HTTP ${res.status})`);
  const body = await res.json();
  return body.fields?.masterAdminUid?.stringValue ?? "";
}

async function supabaseRpc(creds, fn, body = {}) {
  const res = await fetch(`${creds.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: creds.key, authorization: `Bearer ${creds.key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} failed (HTTP ${res.status}): ${redact(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function supabaseSelect(creds, table, params) {
  const res = await fetch(`${creds.url}/rest/v1/${table}?${params}`, {
    headers: { apikey: creds.key, authorization: `Bearer ${creds.key}` },
  });
  if (!res.ok) throw new Error(`select ${table} failed (HTTP ${res.status}): ${redact(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function supabaseInsert(creds, table, rows, { onConflict } = {}) {
  const url = new URL(`${creds.url}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set("on_conflict", onConflict);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: creds.key,
      authorization: `Bearer ${creds.key}`,
      "content-type": "application/json",
      prefer: onConflict ? "resolution=merge-duplicates,return=representation" : "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${table} failed (HTTP ${res.status}): ${redact(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** The one and only Firebase Auth ADMIN write in this whole migration:
 * creating a Supabase identity. This never touches Firebase. */
async function createSupabaseAuthUser(creds, { email, phone, firebaseUid }) {
  const res = await fetch(`${creds.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: creds.key, authorization: `Bearer ${creds.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      ...(email ? { email, email_confirm: true } : {}),
      ...(phone ? { phone, phone_confirm: true } : {}),
      app_metadata: { firebase_uid: firebaseUid, migrated_from: "firebase" },
    }),
  });
  if (!res.ok) throw new Error(`admin.createUser failed (HTTP ${res.status}): ${redact(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body.id ?? body.user?.id;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const dryRun = !apply;

  console.log(dryRun ? "DRY RUN — no Supabase or Firebase write will occur\n" : "APPLY — creating Supabase Auth identities\n");
  console.log("Firebase Auth is READ ONLY throughout: no create, update, disable or delete call exists in this path.\n");

  const sa = await loadServiceAccount();
  const [authToken, dsToken] = await Promise.all([
    getAccessToken(sa, AUTH_SCOPE),
    getAccessToken(sa, DATASTORE_SCOPE),
  ]);
  const supa = await loadSupabaseCredentials();

  const [authUsers, masterUid, stagedUsersRaw, existingProfilesRaw, appConfigRaw] = await Promise.all([
    fetchAllAuthUsers(sa.project_id, authToken),
    fetchMasterAdminUid(sa.project_id, dsToken),
    supabaseRpc(supa, "stage_export_users"),
    supabaseSelect(supa, "profiles", "select=firebase_uid,id"),
    supabaseSelect(supa, "app_config", "select=key,value"),
  ]);

  const firestoreDocs = new Map(stagedUsersRaw.map((r) => [r.id, r.doc]));
  const existingProfiles = new Set(existingProfilesRaw.map((r) => r.firebase_uid).filter(Boolean));
  const uidToProfileId = new Map(existingProfilesRaw.filter((r) => r.firebase_uid).map((r) => [r.firebase_uid, r.id]));
  const masterAlreadySet = appConfigRaw.some((r) => r.key === "master_admin_uid" && r.value);

  const plan = buildMigrationPlan({ authUsers, firestoreDocs, masterUid, existingProfiles });

  const counts = plan.reduce((acc, p) => {
    acc[p.action] = (acc[p.action] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Firebase project: ${sa.project_id}`);
  console.log(`Firestore master admin uid configured: ${masterUid ? "yes" : "no"}`);
  console.log(`Supabase app_config.master_admin_uid already set: ${masterAlreadySet}\n`);

  console.log("Plan (firebase_uid shown — an opaque identifier, no name/email/phone printed)\n");
  for (const p of plan) {
    console.log(
      `  ${p.firebaseUid}  source=${p.source.padEnd(16)} role=${(p.role ?? "customer").padEnd(11)} ` +
        `providers=[${p.providers.join(",")}]  -> ${p.action}`
    );
  }

  console.log("\nSummary");
  for (const [action, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(2)}  ${action}`);

  if (dryRun) {
    console.log("\nNo Supabase account was created. Re-run with --apply to execute this exact plan.");
    return;
  }

  // ---- --apply: pass 1, create identities + customer profiles ----
  const created = [];
  for (const p of plan) {
    if (p.action === "skip-already-migrated") continue;
    const authUser = authUsers.find((u) => u.localId === p.firebaseUid);
    const doc = firestoreDocs.get(p.firebaseUid);

    const newId = await createSupabaseAuthUser(supa, {
      email: authUser.email || undefined,
      phone: authUser.phoneNumber || undefined,
      firebaseUid: p.firebaseUid,
    });
    uidToProfileId.set(p.firebaseUid, newId);

    await supabaseInsert(
      supa,
      "profiles",
      [
        {
          id: newId,
          firebase_uid: p.firebaseUid,
          ...(doc?.name || authUser.displayName ? { name: doc?.name ?? authUser.displayName } : {}),
          ...(authUser.email ? { email: authUser.email } : {}),
          ...(doc?.phone || authUser.phoneNumber ? { phone: doc?.phone ?? authUser.phoneNumber } : {}),
          ...(doc?.photoUrl || authUser.photoUrl ? { photo_url: doc?.photoUrl ?? authUser.photoUrl } : {}),
        },
      ],
      { onConflict: "firebase_uid" }
    );
    created.push({ firebaseUid: p.firebaseUid, supabaseId: newId, action: p.action });

    if (p.action === "create-and-set-master-config") {
      await supabaseInsert(supa, "app_config", [{ key: "master_admin_uid", value: newId }], { onConflict: "key" });
    }
  }

  // ---- --apply: pass 2, staff_roles now that every ancestor uid resolves ----
  for (const p of plan) {
    if (p.action !== "create-and-assign-staff-role") continue;
    const doc = firestoreDocs.get(p.firebaseUid);
    const chain = resolveOwnershipChain(doc, uidToProfileId);
    if (!chainIsResolved(chain)) {
      console.error(`  ! staff_roles skipped for ${p.firebaseUid}: an ancestor in its ownership chain is not yet migrated.`);
      continue;
    }
    await supabaseInsert(
      supa,
      "staff_roles",
      [
        {
          user_id: uidToProfileId.get(p.firebaseUid),
          role: assignedRole(doc),
          status: doc.status,
          super_admin_id: chain.superAdminId,
          admin_id: chain.adminId,
          sub_admin_id: chain.subAdminId,
        },
      ],
      { onConflict: "user_id" }
    );
  }

  console.log(`\nCreated ${created.length} Supabase identity(ies). Firebase Auth was never written to.`);
}

main().catch((e) => {
  console.error(`\nAuth migration failed: ${redact(e)}`);
  process.exit(1);
});
