// READ-ONLY audit of the real Firebase Auth user population.
//
// Calls Identity Platform's accounts:batchGet — the same listing
// endpoint the Admin SDK's listUsers() uses under the hood. It only
// reads; nothing here can create, modify, disable or delete a user.
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (or FIREBASE_SERVICE_ACCOUNT_PATH)
// already configured, same as private-export.mjs. The scope requested
// here (identitytoolkit) is broader than Firestore's — if the service
// account lacks the "Firebase Authentication Admin" (or equivalent)
// IAM role, the call fails with a 403 and this script says so plainly
// rather than guessing.
//
// No name, email, or phone number is ever printed. Only counts,
// provider identifiers, and boolean classifications.
//
// Usage:
//   node scripts/migration/auth-audit.mjs [--cross-ref <exportDir>]

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadServiceAccount, getAccessToken, redact } from "./lib/credentials.mjs";

const AUTH_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

async function fetchAllUsers(projectId, token) {
  const users = [];
  let nextPageToken;
  for (;;) {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`);
    url.searchParams.set("maxResults", "1000");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);

    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 403) {
      throw new Error(
        `Firebase Auth admin listing refused (HTTP 403). The service account needs the ` +
          `"Firebase Authentication Admin" (roles/firebaseauth.admin) IAM role, or broader ` +
          `("Editor"/"Firebase Admin SDK Administrator Service Agent"). Grant it in Google Cloud ` +
          `Console -> IAM, then re-run this script. No user data was read.`
      );
    }
    if (!res.ok) throw new Error(`accounts:batchGet returned HTTP ${res.status}.`);

    const body = await res.json();
    users.push(...(body.users ?? []));
    if (!body.nextPageToken || (body.users ?? []).length === 0) break;
    nextPageToken = body.nextPageToken;
  }
  return users;
}

/** Classifies one Auth user record without retaining any PII field. */
function classify(u) {
  const providers = (u.providerUserInfo ?? []).map((p) => p.providerId);
  const hasPassword = providers.includes("password") || !!u.passwordHash;
  const hasGoogle = providers.includes("google.com");
  const hasPhone = providers.includes("phone") || !!u.phoneNumber;
  const providerSet = new Set(providers.length ? providers : hasPhone ? ["phone"] : []);
  return {
    uid: u.localId,
    providers: [...providerSet],
    providerCount: providerSet.size,
    hasPassword,
    hasGoogle,
    hasPhone,
    phoneOnly: hasPhone && !hasPassword && !hasGoogle,
    disabled: !!u.disabled,
    hasEmail: !!u.email,
    emailLooksValid: !!u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email),
    emailVerified: !!u.emailVerified,
    createdAt: u.createdAt ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

async function loadIds(dir, name) {
  try {
    const text = await readFile(join(dir, `${name}.ndjson`), "utf8");
    return new Set(
      text
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
        .map((r) => r.id)
    );
  } catch {
    return new Set();
  }
}

async function loadRefIds(dir, name, field) {
  try {
    const text = await readFile(join(dir, `${name}.ndjson`), "utf8");
    return new Set(
      text
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
        .map((r) => r.doc?.[field])
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let crossRefDir = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cross-ref") crossRefDir = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }

  const sa = await loadServiceAccount();
  const token = await getAccessToken(sa, AUTH_SCOPE);

  console.log(`Auditing Firebase Auth users for project: ${sa.project_id}`);
  console.log(`Mode: READ ONLY (accounts:batchGet — no write/disable/delete call is made)\n`);

  const rawUsers = await fetchAllUsers(sa.project_id, token);
  const users = rawUsers.map(classify);

  const total = users.length;
  const disabled = users.filter((u) => u.disabled).length;
  const googleUsers = users.filter((u) => u.hasGoogle).length;
  const passwordUsers = users.filter((u) => u.hasPassword).length;
  const phoneOnly = users.filter((u) => u.phoneOnly).length;
  const anyPhone = users.filter((u) => u.hasPhone).length;
  const multiProvider = users.filter((u) => u.providerCount > 1).length;
  const missingEmail = users.filter((u) => !u.hasEmail && !u.hasPhone).length;
  const invalidEmail = users.filter((u) => u.hasEmail && !u.emailLooksValid).length;
  const unverifiedEmail = users.filter((u) => u.hasEmail && !u.emailVerified).length;
  const noProviderAtAll = users.filter((u) => u.providerCount === 0 && !u.hasEmail).length;

  console.log("Provider breakdown");
  console.log(`  total accounts            ${total}`);
  console.log(`  google.com                ${googleUsers}`);
  console.log(`  password (email/pass)     ${passwordUsers}`);
  console.log(`  phone (any)               ${anyPhone}`);
  console.log(`  phone-ONLY (no other)     ${phoneOnly}`);
  console.log(`  multiple providers        ${multiProvider}`);
  console.log(`  disabled                  ${disabled}`);
  console.log(`  missing email AND phone   ${missingEmail}`);
  console.log(`  email present but malformed ${invalidEmail}`);
  console.log(`  email present, unverified ${unverifiedEmail}`);
  console.log(`  no provider + no email    ${noProviderAtAll}`);

  if (crossRefDir) {
    console.log("\nCross-reference against exported private data (uid overlap only, no content)");
    const exportedUserIds = await loadIds(crossRefDir, "users");
    const patientOwnerIds = await loadRefIds(crossRefDir, "patients", "userId");
    const bookingOwnerIds = await loadRefIds(crossRefDir, "bookings", "userId");
    const notificationOwnerIds = await loadRefIds(crossRefDir, "notifications", "userId");

    const authUids = new Set(users.map((u) => u.uid));
    const inBoth = [...authUids].filter((id) => exportedUserIds.has(id)).length;
    const authOnly = authUids.size - inBoth;
    const exportOnly = [...exportedUserIds].filter((id) => !authUids.has(id)).length;

    console.log(`  Auth users also in users/{uid} Firestore doc   ${inBoth}`);
    console.log(`  Auth users with NO users/{uid} Firestore doc   ${authOnly}`);
    console.log(`  users/{uid} docs with NO matching Auth account ${exportOnly}`);
    console.log(`  patients referencing an Auth uid                ${[...patientOwnerIds].filter((id) => authUids.has(id)).length} / ${patientOwnerIds.size}`);
    console.log(`  bookings referencing an Auth uid                ${[...bookingOwnerIds].filter((id) => authUids.has(id)).length} / ${bookingOwnerIds.size}`);
    console.log(`  notifications referencing an Auth uid           ${[...notificationOwnerIds].filter((id) => authUids.has(id)).length} / ${notificationOwnerIds.size}`);
  }

  console.log("\nNo user was created, modified, disabled, or deleted.");
}

main().catch((e) => {
  console.error(`\nAuth audit failed: ${redact(e)}`);
  process.exit(1);
});
