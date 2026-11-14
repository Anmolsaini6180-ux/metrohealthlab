// Exports the private Firestore collections to NDJSON on your own
// machine. READ ONLY: the only Firestore call it makes is a paged GET.
// Nothing in Firebase is written, changed or deleted.
//
// The service-account key is read from the path in
// GOOGLE_APPLICATION_CREDENTIALS and is never printed or copied into
// the output. The output contains personal data, so it must be written
// outside the repository; the script refuses otherwise.
//
// Usage:
//   node scripts/migration/private-export.mjs --out <dir> [options]
//
//   --out <dir>            where to write the NDJSON (required, outside the repo)
//   --collections a,b      subset to export (default: all seven)
//   --resume               continue from the last saved page token
//   --page-size <n>        documents per request (default 300)
//   --limit <n>            stop after n documents per collection (for a smoke test)
//
// Resumability: after every page the checkpoint file records the next
// page token and how many documents have been written. Re-running with
// --resume continues from there. Without --resume the collection starts
// again from scratch and its file is truncated, so a restart can never
// interleave two partial exports.

import { mkdir, writeFile, readFile, appendFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadServiceAccount, getAccessToken, assertSafeOutputDir, redact } from "./lib/credentials.mjs";
import { decodeFields, documentId } from "./lib/firestoreValue.mjs";

export const PRIVATE_COLLECTIONS = [
  "users",
  "patients",
  "addresses",
  "bookings",
  "reports",
  "notifications",
  "auditLogs",
];

function parseArgs(argv) {
  const args = { pageSize: 300, resume: false, collections: PRIVATE_COLLECTIONS, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--collections") args.collections = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--resume") args.resume = true;
    else if (a === "--page-size") args.pageSize = Number(argv[++i]);
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.out) throw new Error("--out <dir> is required");
  const unknown = args.collections.filter((c) => !PRIVATE_COLLECTIONS.includes(c));
  if (unknown.length) throw new Error(`unknown collection(s): ${unknown.join(", ")}`);
  return args;
}

const checkpointPath = (dir) => join(dir, "_checkpoint.json");

async function readCheckpoint(dir) {
  try {
    return JSON.parse(await readFile(checkpointPath(dir), "utf8"));
  } catch {
    return {};
  }
}

async function writeCheckpoint(dir, cp) {
  await writeFile(checkpointPath(dir), JSON.stringify(cp, null, 2));
}

/** One page of documents from a collection. */
async function fetchPage({ projectId, token, collection, pageSize, pageToken }) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`
  );
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 403) {
    throw new Error(
      `Firestore refused to read "${collection}" (HTTP 403). The service account needs the ` +
        `"Cloud Datastore User" or "Firebase Rules Viewer"/"Editor" role on the project.`
    );
  }
  if (!res.ok) throw new Error(`Firestore returned HTTP ${res.status} for "${collection}".`);

  const body = await res.json();
  return {
    docs: (body.documents ?? []).map((d) => ({ id: documentId(d.name), doc: decodeFields(d.fields) })),
    nextPageToken: body.nextPageToken ?? null,
  };
}

async function exportCollection({ dir, projectId, token, collection, pageSize, resume, limit, checkpoint }) {
  const file = join(dir, `${collection}.ndjson`);
  const prior = checkpoint[collection];

  let pageToken = null;
  let written = 0;

  if (resume && prior && prior.done) {
    console.log(`  ${collection.padEnd(14)} already complete (${prior.written} docs) — skipping`);
    return prior;
  }
  if (resume && prior && prior.nextPageToken) {
    pageToken = prior.nextPageToken;
    written = prior.written;
    console.log(`  ${collection.padEnd(14)} resuming after ${written} docs`);
  } else {
    // Fresh start: drop any partial file so a restart cannot append to
    // a half-finished export.
    if (existsSync(file)) await rm(file);
    await writeFile(file, "");
  }

  for (;;) {
    const { docs, nextPageToken } = await fetchPage({ projectId, token, collection, pageSize, pageToken });

    const remaining = limit - written;
    const batch = docs.length > remaining ? docs.slice(0, remaining) : docs;
    if (batch.length) {
      await appendFile(file, batch.map((d) => JSON.stringify(d)).join("\n") + "\n");
      written += batch.length;
    }

    const done = !nextPageToken || written >= limit;
    checkpoint[collection] = { written, nextPageToken: done ? null : nextPageToken, done };
    await writeCheckpoint(dir, checkpoint);

    // Redraw in place only on a real terminal; piped output would
    // otherwise keep every intermediate line.
    if (process.stdout.isTTY) process.stdout.write(`\r  ${collection.padEnd(14)} ${written} docs`);
    if (done) break;
    pageToken = nextPageToken;
  }

  console.log(`${process.stdout.isTTY ? "\r" : ""}  ${collection.padEnd(14)} ${written} docs`);
  return checkpoint[collection];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = assertSafeOutputDir(args.out);

  // Authenticate before touching the filesystem, so a run that cannot
  // reach Firestore leaves no half-made output directory behind.
  const sa = await loadServiceAccount();
  const token = await getAccessToken(sa);

  await mkdir(dir, { recursive: true });

  // The project id comes from the key itself, so the export can never
  // be aimed at the wrong project by a stray argument.
  console.log(`Exporting from Firebase project: ${sa.project_id}`);
  console.log(`Output directory: ${dir}`);
  console.log(`Mode: READ ONLY (no Firebase writes)\n`);

  const checkpoint = await readCheckpoint(dir);
  const summary = {};

  for (const collection of args.collections) {
    const result = await exportCollection({
      dir,
      projectId: sa.project_id,
      token,
      collection,
      pageSize: args.pageSize,
      resume: args.resume,
      limit: args.limit,
      checkpoint,
    });
    summary[collection] = result.written;
  }

  await writeFile(
    join(dir, "_export-summary.json"),
    JSON.stringify({ projectId: sa.project_id, exportedAt: new Date().toISOString(), counts: summary }, null, 2)
  );

  console.log("\nSource counts:");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`\nTotal: ${Object.values(summary).reduce((a, b) => a + b, 0)} documents`);
  console.log(`\nNext: node scripts/migration/private-report.mjs --in "${dir}"`);
}

if (process.argv[1] && process.argv[1].endsWith("private-export.mjs")) {
  main().catch((e) => {
    console.error(`\nExport failed: ${redact(e)}`);
    process.exit(1);
  });
}
