// Integrity report over the exported NDJSON, produced BEFORE anything
// is imported. Reads only local files — no Firebase credential, no
// Supabase credential, no network.
//
// Usage:
//   node scripts/migration/private-report.mjs --in <dir> [--json]
//
// Exit code is 1 if any BLOCKING problem is found (duplicate ids, or a
// document with no id), so the runbook can stop before an import. Every
// other finding is reported and does not stop the run: orphaned
// references are facts about the production data, and dropping them
// silently would be worse than carrying them forward knowingly.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PRIVATE_COLLECTIONS } from "./private-export.mjs";

async function readNdjson(dir, name) {
  let text;
  try {
    text = await readFile(join(dir, `${name}.ndjson`), "utf8");
  } catch {
    return null; // not exported
  }
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`${name}.ndjson line ${i + 1} is not valid JSON`);
      }
    });
}

/**
 * Ids seen more than once, and rows carrying no id at all.
 *
 * Duplicates are split by whether the documents actually differ. A
 * resumed export can re-fetch a page and write the same document twice;
 * that is harmless, and the importer collapses it. Two DIFFERENT
 * documents sharing an id is another matter — it means the export
 * captured two states of the same record, and silently keeping the last
 * one would quietly pick a winner. Only that case blocks.
 */
function idIssues(rows) {
  const seen = new Map();
  let missing = 0;
  for (const r of rows) {
    if (!r.id) { missing += 1; continue; }
    const bucket = seen.get(r.id) ?? [];
    bucket.push(JSON.stringify(r.doc ?? null));
    seen.set(r.id, bucket);
  }
  const repeated = [...seen.entries()].filter(([, docs]) => docs.length > 1);
  const benignDuplicates = [];
  const conflictingDuplicates = [];
  for (const [id, docs] of repeated) {
    const entry = { id, count: docs.length };
    if (new Set(docs).size === 1) benignDuplicates.push(entry);
    else conflictingDuplicates.push({ ...entry, distinctVersions: new Set(docs).size });
  }
  return { benignDuplicates, conflictingDuplicates, missing, unique: seen.size };
}

/** Rows whose `field` is absent, or points at an id not in `pool`. */
function orphans(rows, field, pool, { required = true } = {}) {
  const missingRef = [];
  const danglingRef = [];
  for (const r of rows) {
    const v = r.doc?.[field];
    if (v === undefined || v === null || v === "") {
      if (required) missingRef.push(r.id);
    } else if (!pool.has(v)) {
      danglingRef.push({ id: r.id, [field]: v });
    }
  }
  return { missingRef, danglingRef };
}

const line = (label, n, note = "") =>
  `  ${n === 0 ? "OK  " : "  ! "} ${String(n).padStart(6)}  ${label}${note ? `  (${note})` : ""}`;

async function main() {
  const argv = process.argv.slice(2);
  let dir = null;
  let asJson = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--in") dir = argv[++i];
    else if (argv[i] === "--json") asJson = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!dir) throw new Error("--in <dir> is required");

  const data = {};
  for (const c of PRIVATE_COLLECTIONS) data[c] = await readNdjson(dir, c);

  const missingFiles = PRIVATE_COLLECTIONS.filter((c) => data[c] === null);
  for (const c of missingFiles) data[c] = [];

  const ids = Object.fromEntries(
    PRIVATE_COLLECTIONS.map((c) => [c, new Set(data[c].map((r) => r.id).filter(Boolean))])
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sourceDirectory: dir,
    notExported: missingFiles,
    sourceCounts: Object.fromEntries(PRIVATE_COLLECTIONS.map((c) => [c, data[c].length])),
    idIntegrity: Object.fromEntries(PRIVATE_COLLECTIONS.map((c) => [c, idIssues(data[c])])),
    relationships: {
      patients_without_users: orphans(data.patients, "userId", ids.users),
      addresses_without_users: orphans(data.addresses, "userId", ids.users),
      bookings_without_users: orphans(data.bookings, "userId", ids.users),
      bookings_without_patients: orphans(data.bookings, "patientId", ids.patients),
      bookings_without_addresses: orphans(data.bookings, "addressId", ids.addresses, { required: false }),
      reports_without_users: orphans(data.reports, "userId", ids.users),
      reports_without_bookings: orphans(data.reports, "bookingId", ids.bookings),
      notifications_without_users: orphans(data.notifications, "userId", ids.users),
      auditlogs_without_actors: orphans(data.auditLogs, "actorId", ids.users, { required: false }),
    },
    // Firebase Auth is not migrated yet, so no exported user has a
    // Supabase profile. Recorded so the gap is explicit.
    usersWithoutProfiles: {
      count: data.users.length,
      reason: "Firebase Auth accounts are not migrated yet; public.profiles is empty by design at this stage.",
    },
  };

  const blocking =
    PRIVATE_COLLECTIONS.reduce(
      (n, c) => n + report.idIntegrity[c].conflictingDuplicates.length + report.idIntegrity[c].missing,
      0
    );
  report.blockingIssues = blocking;

  await writeFile(join(dir, "migration-report.json"), JSON.stringify(report, null, 2));

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("PRIVATE DATA MIGRATION REPORT");
    console.log(`Source: ${dir}\n`);

    console.log("Source counts");
    for (const c of PRIVATE_COLLECTIONS) {
      const note = missingFiles.includes(c) ? "not exported" : "";
      console.log(`  ${c.padEnd(14)} ${String(data[c].length).padStart(6)}${note ? `   (${note})` : ""}`);
    }

    console.log("\nId integrity (blocking)");
    for (const c of PRIVATE_COLLECTIONS) {
      const t = report.idIntegrity[c];
      console.log(line(`${c}: ids with conflicting documents`, t.conflictingDuplicates.length));
      console.log(line(`${c}: documents with no id`, t.missing));
      if (t.benignDuplicates.length) {
        console.log(`       ${String(t.benignDuplicates.length).padStart(6)}  ${c}: identical duplicates (collapsed on import, not a problem)`);
      }
    }

    console.log("\nRelationships (informational — orphans are carried forward, not dropped)");
    for (const [k, v] of Object.entries(report.relationships)) {
      console.log(line(`${k}: reference absent`, v.missingRef.length));
      console.log(line(`${k}: reference points at a missing row`, v.danglingRef.length));
    }

    console.log("\nAuth readiness");
    console.log(`     ${String(report.usersWithoutProfiles.count).padStart(6)}  users without a Supabase profile`);
    console.log(`             ${report.usersWithoutProfiles.reason}`);

    console.log(`\nBlocking issues: ${blocking}`);
    console.log(`Full report written to ${join(dir, "migration-report.json")}`);
    if (blocking === 0) {
      console.log(`\nNext (dry run): node scripts/migration/private-import.mjs --in "${dir}" --dry-run`);
    } else {
      console.log(`\nResolve the blocking issues before importing.`);
    }
  }

  process.exit(blocking === 0 ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("private-report.mjs")) {
  main().catch((e) => {
    console.error(`Report failed: ${e.message}`);
    process.exit(2);
  });
}
