// Exports PUBLICLY READABLE Firestore collections to JSON.
//
// Deliberately read-only and credential-free: every collection below is
// `allow read: if true` in firestore.rules, so this needs no service
// account and can never modify production. Collections holding customer
// data (bookings, users, patients, addresses, reports, notifications,
// auditLogs) are NOT listed here — they require a privileged export and
// are a later phase.
//
// Usage: node scripts/migration/firestore-export.mjs <outDir>

import { mkdir, writeFile } from "node:fs/promises";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "metro-health-0001";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

export const PUBLIC_COLLECTIONS = [
  "testCategories", "tests", "packages", "labs", "labPricing",
  "serviceAreas", "slots", "offers", "banners", "articles", "settings",
];

/** Firestore REST wraps every value in a type tag; unwrap to plain JS. */
function decodeValue(v) {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("bytesValue" in v) return null; // not used by this app
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

/** Follows nextPageToken so nothing is silently truncated. */
export async function fetchCollection(name) {
  const docs = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const body = await res.json();
    for (const d of body.documents ?? []) {
      docs.push({ id: d.name.split("/").pop(), ...decodeFields(d.fields ?? {}) });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("Usage: node firestore-export.mjs <outDir>");
  await mkdir(outDir, { recursive: true });

  const summary = {};
  for (const name of PUBLIC_COLLECTIONS) {
    const docs = await fetchCollection(name);
    await writeFile(`${outDir}/${name}.json`, JSON.stringify(docs, null, 2));
    summary[name] = docs.length;
    console.log(`${name.padEnd(16)} ${docs.length}`);
  }
  await writeFile(`${outDir}/_summary.json`, JSON.stringify(summary, null, 2));
  console.log("\nTotal documents:", Object.values(summary).reduce((a, b) => a + b, 0));
}

// Run when invoked directly. The transform script imports the helpers
// above instead of calling main().
if (process.argv[1] && process.argv[1].endsWith("firestore-export.mjs")) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
