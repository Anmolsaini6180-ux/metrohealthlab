// Credential handling for the private-data migration.
//
// Rules this module enforces, so the individual scripts cannot get them
// wrong:
//
//   * secrets are read only from environment variables, or from a file
//     whose PATH comes from an environment variable
//   * the credential file must live outside this repository, so it can
//     never be committed by accident
//   * no secret is ever printed, logged, or written into an output file
//   * errors are redacted before they surface, because HTTP libraries
//     love to echo request bodies containing tokens
//
// Nothing here ever asks a human to paste a key anywhere.

import { readFile, stat } from "node:fs/promises";
import { createSign } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** True when `p` sits inside the repository working tree. */
export function isInsideRepo(p) {
  const rel = relative(REPO_ROOT, resolve(p));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Strips anything secret-shaped out of a message. Access tokens, JWTs
 * and PEM blocks all have recognisable shapes; when in doubt this is
 * deliberately over-eager.
 */
export function redact(input) {
  return String(input && input.message ? input.message : input)
    .replace(/-----BEGIN[\s\S]*?END[^-]*-----/g, "[redacted private key]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[redacted jwt]")
    .replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted supabase key]")
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, "[redacted access token]");
}

/** Throws with a redacted message, so a stack trace cannot leak a key. */
export function fail(message) {
  throw new Error(redact(message));
}

function requireEnv(names, what) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return { name: n, value: v.trim() };
  }
  fail(
    `${what} not found. Set one of these environment variables (do not paste the value into a terminal that logs history):\n` +
      names.map((n) => `  ${n}`).join("\n")
  );
}

/**
 * Loads the Firebase service account from the path in
 * GOOGLE_APPLICATION_CREDENTIALS (or FIREBASE_SERVICE_ACCOUNT_PATH).
 *
 * The returned object is never logged; callers pass it straight to
 * getAccessToken and then forget it.
 */
export async function loadServiceAccount() {
  const { name, value } = requireEnv(
    ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_PATH"],
    "Firebase service-account key path"
  );
  const path = resolve(value);

  if (isInsideRepo(path)) {
    fail(
      `${name} points inside the repository. Move the key somewhere outside the project ` +
        `(for example your user profile directory) so it can never be committed.`
    );
  }

  try {
    await stat(path);
  } catch {
    fail(`${name} points at a file that does not exist. Check the path.`);
  }

  let sa;
  try {
    sa = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(`The file named by ${name} is not valid JSON. Expected a service-account key file.`);
  }

  for (const field of ["project_id", "client_email", "private_key"]) {
    if (!sa[field]) fail(`The service-account file is missing "${field}".`);
  }
  return sa;
}

/**
 * Exchanges the service account for a short-lived read-only access
 * token. The datastore scope is the narrowest one that can read
 * Firestore; nothing here can write.
 */
export async function getAccessToken(sa, scope = "https://www.googleapis.com/auth/datastore") {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned =
    `${enc({ alg: "RS256", typ: "JWT" })}.` +
    enc({
      iss: sa.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });

  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key.replace(/\\n/g, "\n"), "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  if (!res.ok) {
    // The body can echo the assertion, so only the status is surfaced.
    fail(`Could not obtain a Google access token (HTTP ${res.status}). Check that the service account is valid and the Firestore API is enabled.`);
  }
  const json = await res.json();
  if (!json.access_token) fail("Google returned no access token.");
  return json.access_token;
}

/**
 * Supabase project URL and service-role key.
 *
 * The key can come from SUPABASE_SERVICE_ROLE_KEY directly, or — same
 * pattern as the Firebase service account — from a file named by
 * SUPABASE_SERVICE_ROLE_KEY_FILE. The file path form exists so the key
 * never has to be typed into a chat, a chat-driven terminal, or any
 * other transcript: it is written to disk out-of-band (e.g. from the
 * Supabase dashboard, saved directly to a local file) and only its path
 * is ever communicated.
 */
export async function loadSupabaseCredentials() {
  const url = requireEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"], "Supabase project URL").value;

  let key;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY_FILE) {
    const path = resolve(process.env.SUPABASE_SERVICE_ROLE_KEY_FILE);
    if (isInsideRepo(path)) {
      fail("SUPABASE_SERVICE_ROLE_KEY_FILE points inside the repository. Move the key file outside the project.");
    }
    try {
      key = (await readFile(path, "utf8")).trim();
    } catch {
      fail("SUPABASE_SERVICE_ROLE_KEY_FILE points at a file that does not exist or cannot be read.");
    }
    if (!key) fail("SUPABASE_SERVICE_ROLE_KEY_FILE points at an empty file.");
  } else {
    key = requireEnv(["SUPABASE_SERVICE_ROLE_KEY"], "Supabase service-role key (or SUPABASE_SERVICE_ROLE_KEY_FILE)").value;
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    fail("SUPABASE_URL does not look like a Supabase project URL (https://<ref>.supabase.co).");
  }
  // A publishable/anon key cannot write to staging; catching it here
  // gives a clear message instead of a wall of 401s.
  if (/^sb_publishable_/.test(key)) {
    fail("The Supabase key provided is a publishable key. The importer needs the service-role key.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

/**
 * Refuses to write exported personal data anywhere inside the repo.
 * The export contains names, phone numbers and addresses; it must not
 * end up in git history.
 */
export function assertSafeOutputDir(dir) {
  if (isInsideRepo(dir)) {
    fail(
      `Refusing to write personal data inside the repository (${dir}).\n` +
        `Choose a directory outside the project, for example:\n` +
        `  --out "${process.env.USERPROFILE || process.env.HOME || "~"}/metro-health-export"`
    );
  }
  return resolve(dir);
}
