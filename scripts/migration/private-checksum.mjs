// Proves the staged rows in Supabase match the Firebase export
// byte-for-byte, without ever moving the underlying personal data
// through a visible channel — only an opaque MD5 per collection leaves
// this machine, and only that hash is printed.
//
// Both sides serialize with the same canonical form: object keys sorted
// alphabetically at every level, no whitespace. jsonb's own `::text`
// cast does not guarantee alphabetical key order, so this exists
// specifically to avoid a false MISMATCH on data that is actually
// identical (see the matching staging.canonical_json in Postgres).
//
// Usage:
//   node scripts/migration/private-checksum.mjs --in <dir>

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadSupabaseCredentials, redact } from "./lib/credentials.mjs";
import { PRIVATE_COLLECTIONS } from "./private-export.mjs";

function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
}

async function localChecksum(dir, name) {
  let text;
  try {
    text = await readFile(join(dir, `${name}.ndjson`), "utf8");
  } catch {
    return null;
  }
  const rows = text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (rows.length === 0) return null;
  const joined = rows.map((r) => `${r.id}|${canonicalJson(r.doc)}`).join("\n");
  return createHash("md5").update(joined, "utf8").digest("hex");
}

async function main() {
  const argv = process.argv.slice(2);
  let dir = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--in") dir = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!dir) throw new Error("--in <dir> is required");

  const creds = await loadSupabaseCredentials();
  const res = await fetch(`${creds.url}/rest/v1/rpc/stage_checksum`, {
    method: "POST",
    headers: { apikey: creds.key, authorization: `Bearer ${creds.key}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`stage_checksum failed (HTTP ${res.status}): ${redact(await res.text()).slice(0, 300)}`);
  const remote = await res.json();

  console.log("Checksum verification (staging vs Firebase export)\n");
  let allMatch = true;
  for (const c of PRIVATE_COLLECTIONS) {
    const local = await localChecksum(dir, c);
    const server = remote[c] ?? null;

    if (local === null && server === null) {
      console.log(`  --   ${c.padEnd(14)} empty on both sides`);
      continue;
    }
    const match = local === server;
    if (!match) allMatch = false;
    console.log(`  ${match ? "OK " : " ! "} ${c.padEnd(14)} local=${local ?? "(empty)"}  staged=${server ?? "(empty)"}`);
  }

  console.log(allMatch ? "\nAll checksums match." : "\nMISMATCH — investigate before proceeding.");
  process.exit(allMatch ? 0 : 1);
}

main().catch((e) => {
  console.error(`Checksum verification failed: ${redact(e)}`);
  process.exit(1);
});
