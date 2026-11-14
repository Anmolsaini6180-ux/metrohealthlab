// Imports the exported NDJSON into the Supabase `staging` schema.
//
// It does NOT write to the live application tables. profiles.id is a
// foreign key onto auth.users, and Firebase Auth accounts are not
// migrated yet, so private rows have nothing valid to reference in the
// live schema. Staging holds every document keyed by its Firebase id
// with the relationships preserved as text, ready to be promoted at
// cutover once auth accounts exist.
//
// Usage:
//   node scripts/migration/private-import.mjs --in <dir> [options]
//
//   --dry-run           validate and count, send nothing (default: off)
//   --collections a,b   subset to import
//   --batch <n>         rows per request (default 500)
//   --resume            skip batches already recorded as applied
//   --verify            re-run the server-side integrity report afterwards
//
// Guarantees:
//   idempotent    every write is INSERT ... ON CONFLICT (id) DO UPDATE,
//                 so a repeated run converges instead of duplicating
//   transactional each batch is a single statement inside stage_upsert,
//                 so a batch either lands completely or not at all
//   resumable     applied batches are recorded in a local checkpoint;
//                 --resume continues after the last confirmed batch
//
// Cross-batch atomicity is not available over HTTP. Idempotent upserts
// plus the checkpoint make a resumed run converge to the same state,
// which is the property that actually matters here.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadSupabaseCredentials, redact } from "./lib/credentials.mjs";
import { PRIVATE_COLLECTIONS } from "./private-export.mjs";

function parseArgs(argv) {
  const args = { batch: 500, dryRun: false, resume: false, verify: false, collections: PRIVATE_COLLECTIONS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[++i];
    else if (a === "--collections") args.collections = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--batch") args.batch = Number(argv[++i]);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--resume") args.resume = true;
    else if (a === "--verify") args.verify = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.in) throw new Error("--in <dir> is required");
  return args;
}

async function readNdjson(dir, name) {
  let text;
  try {
    text = await readFile(join(dir, `${name}.ndjson`), "utf8");
  } catch {
    return [];
  }
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/**
 * Later documents win, so a resumed export that re-fetched a page
 * cannot import the same id twice.
 */
function dedupe(rows) {
  const byId = new Map();
  for (const r of rows) if (r.id) byId.set(r.id, r);
  return [...byId.values()];
}

/** Identifies a batch by content, so a changed export invalidates it. */
const batchKey = (collection, rows) =>
  `${collection}:${createHash("sha256").update(rows.map((r) => r.id).join(",")).digest("hex").slice(0, 16)}`;

async function rpc({ url, key }, fn, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) {
    // Never echo the request body: it holds personal data.
    throw new Error(`Supabase ${fn} failed (HTTP ${res.status}): ${redact(text).slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const checkpointPath = (dir) => join(dir, "_import-checkpoint.json");

async function readCheckpoint(dir) {
  try {
    return JSON.parse(await readFile(checkpointPath(dir), "utf8"));
  } catch {
    return { applied: [] };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const creds = args.dryRun ? null : await loadSupabaseCredentials();

  console.log(args.dryRun ? "DRY RUN — nothing will be written\n" : "IMPORT — writing to the staging schema\n");

  const checkpoint = await readCheckpoint(args.in);
  const applied = new Set(args.resume ? checkpoint.applied : []);
  const sourceCounts = {};
  const sentCounts = {};

  for (const collection of args.collections) {
    const raw = await readNdjson(args.in, collection);
    const rows = dedupe(raw);
    sourceCounts[collection] = rows.length;
    sentCounts[collection] = 0;

    if (raw.length !== rows.length) {
      console.log(`  ${collection.padEnd(14)} ${raw.length - rows.length} duplicate id(s) collapsed`);
    }
    if (rows.length === 0) {
      console.log(`  ${collection.padEnd(14)} nothing to import`);
      continue;
    }

    for (let i = 0; i < rows.length; i += args.batch) {
      const batch = rows.slice(i, i + args.batch);
      const keyed = batchKey(collection, batch);

      if (applied.has(keyed)) {
        sentCounts[collection] += batch.length;
        continue;
      }
      if (!args.dryRun) {
        await rpc(creds, "stage_upsert", {
          p_collection: collection,
          p_rows: batch.map((r) => ({ id: r.id, doc: r.doc })),
        });
        checkpoint.applied = [...applied.add(keyed)];
        await writeFile(checkpointPath(args.in), JSON.stringify(checkpoint, null, 2));
      }
      sentCounts[collection] += batch.length;
      // Redraw in place only on a real terminal; piped output would
      // otherwise keep every intermediate line.
      if (process.stdout.isTTY) {
        process.stdout.write(`\r  ${collection.padEnd(14)} ${sentCounts[collection]}/${rows.length}`);
      }
    }
    console.log(`${process.stdout.isTTY ? "\r" : ""}  ${collection.padEnd(14)} ${sentCounts[collection]}/${rows.length}`);
  }

  console.log("\nSource vs target");
  if (args.dryRun) {
    for (const c of args.collections) {
      console.log(`  ${c.padEnd(14)} source ${String(sourceCounts[c]).padStart(6)}   would import ${String(sentCounts[c]).padStart(6)}`);
    }
    console.log("\nNo rows were written. Re-run without --dry-run to import.");
    return;
  }

  const report = await rpc(creds, "stage_report", {});
  const target = report.target_counts;
  let mismatch = 0;
  for (const c of args.collections) {
    const ok = target[c] === sourceCounts[c];
    if (!ok) mismatch += 1;
    console.log(`  ${ok ? "OK " : " ! "} ${c.padEnd(14)} source ${String(sourceCounts[c]).padStart(6)}   target ${String(target[c]).padStart(6)}`);
  }

  if (args.verify) {
    console.log("\nServer-side integrity report");
    for (const [group, checks] of Object.entries(report)) {
      if (group === "target_counts") continue;
      console.log(`  ${group}`);
      for (const [k, v] of Object.entries(checks)) {
        const clean = typeof v === "number" && v === 0;
        console.log(`    ${clean ? "OK " : "   "} ${String(v).padStart(8)}  ${k}`);
      }
    }
  }

  console.log(mismatch === 0 ? "\nAll collections match." : `\n${mismatch} collection(s) do not match — investigate before promoting.`);
  process.exit(mismatch === 0 ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("private-import.mjs")) {
  main().catch((e) => {
    console.error(`\nImport failed: ${redact(e)}`);
    process.exit(1);
  });
}
