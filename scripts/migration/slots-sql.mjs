// Emits the slots import as a set-based statement instead of 720 literal
// rows, because the exported slots are a complete grid:
//
//   4 service areas x 15 dates x 6 two-hour windows x 2 collection types
//
// with no gaps and no duplicates, and with capacity, bookedCount, active
// and updatedBy each holding a single value across every document. The
// only column that genuinely varies is updatedAt, which falls into
// contiguous runs when the rows are read in id order — the order the
// seeding script wrote them in.
//
// Every one of those properties is re-checked here against the export
// before any SQL is produced, and the import is verified column by
// column afterwards. If the source data stops being a clean grid this
// script fails loudly rather than inventing rows.
//
// Usage: node scripts/migration/slots-sql.mjs <exportDir> <outFile>

import { readFile, writeFile } from "node:fs/promises";

const SQ = String.fromCharCode(39);
const q = (v) => SQ + String(v).split(SQ).join(SQ + SQ) + SQ;

function assert(cond, msg) {
  if (!cond) throw new Error(`slots export is not a clean grid: ${msg}`);
}

/** The single value a field holds across every row, or throws. */
function constant(rows, field) {
  const values = [...new Set(rows.map((r) => JSON.stringify(r[field])))];
  assert(values.length === 1, `${field} has ${values.length} distinct values`);
  return JSON.parse(values[0]);
}

async function main() {
  const [dir, outFile] = process.argv.slice(2);
  if (!dir || !outFile) throw new Error("Usage: node slots-sql.mjs <exportDir> <outFile>");

  const slots = JSON.parse(await readFile(`${dir}/slots.json`, "utf8"));

  const areas = [...new Set(slots.map((s) => s.areaId))].sort();
  const dates = [...new Set(slots.map((s) => s.date))].sort();
  const types = [...new Set(slots.map((s) => s.collectionType))].sort();
  const windows = [...new Set(slots.map((s) => `${s.startTime}|${s.endTime}`))]
    .sort()
    .map((w) => w.split("|"));

  const capacity = constant(slots, "capacity");
  const booked = constant(slots, "bookedCount");
  const active = constant(slots, "active");
  const updatedBy = constant(slots, "updatedBy");

  // The grid must be complete and duplicate-free.
  const expected = areas.length * dates.length * windows.length * types.length;
  assert(slots.length === expected, `${slots.length} rows but grid is ${expected}`);
  const seen = new Set(slots.map((s) => s.id));
  assert(seen.size === slots.length, "duplicate ids");

  // Ids must be exactly area_date_HHMM_type, or reconstructing them
  // from the grid would rename rows.
  for (const s of slots) {
    const id = `${s.areaId}_${s.date}_${s.startTime.replace(":", "")}_${s.collectionType}`;
    assert(s.id === id, `id ${s.id} does not match ${id}`);
  }
  // Every grid cell must be present.
  for (const a of areas) {
    for (const d of dates) {
      for (const [st] of windows) {
        for (const ct of types) {
          assert(seen.has(`${a}_${d}_${st.replace(":", "")}_${ct}`), `missing cell ${a} ${d} ${st} ${ct}`);
        }
      }
    }
  }
  // Each start time must map to exactly one end time.
  const ends = new Map();
  for (const s of slots) {
    const prev = ends.get(s.startTime);
    assert(prev === undefined || prev === s.endTime, `startTime ${s.startTime} has two end times`);
    ends.set(s.startTime, s.endTime);
  }

  // updatedAt in id order, collapsed into contiguous runs. Sorting by id
  // is the same as ordering by (area, date, start, type): every field is
  // fixed width and "center" sorts before "home".
  const byId = [...slots].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const runs = [];
  for (const [i, s] of byId.entries()) {
    const last = runs[runs.length - 1];
    if (last && last.updatedAt === s.updatedAt) last.upto = i + 1;
    else runs.push({ updatedAt: s.updatedAt, upto: i + 1 });
  }

  const values = (rows) => rows.map((r) => `(${r})`).join(", ");
  const branches = runs
    .slice(0, -1)
    .map((r) => `      when g.rn <= ${r.upto} then ${q(r.updatedAt)}::timestamptz`)
    .join("\n");

  const sql = `-- ${slots.length} slots: ${areas.length} areas x ${dates.length} dates x ${windows.length} windows x ${types.length} collection types.
-- Reconstructed from the grid; every column is verified against the export after import.
insert into public.slots (id, area_id, date, start_time, end_time, collection_type, capacity, booked_count, active, updated_by_firebase_uid, updated_at)
select
  g.area_id || '_' || to_char(g.d, 'YYYY-MM-DD') || '_' || replace(g.st, ':', '') || '_' || g.ct,
  g.area_id, g.d, g.st, g.et, g.ct::collection_type,
  ${capacity}, ${booked}, ${active}, ${q(updatedBy)},
  case
${branches}
      else ${q(runs[runs.length - 1].updatedAt)}::timestamptz
  end
from (
  select a.area_id, d.d, w.st, w.et, c.ct,
         row_number() over (order by a.area_id, d.d, w.st, c.ct) as rn
  from (values ${values(areas.map((a) => q(a)))}) a(area_id)
  cross join (values ${values(dates.map((d) => `${q(d)}::date`))}) d(d)
  cross join (values ${values(windows.map(([st, et]) => `${q(st)}, ${q(et)}`))}) w(st, et)
  cross join (values ${values(types.map((t) => q(t)))}) c(ct)
) g
on conflict (id) do update set
  area_id = excluded.area_id, date = excluded.date, start_time = excluded.start_time,
  end_time = excluded.end_time, collection_type = excluded.collection_type,
  capacity = excluded.capacity, booked_count = excluded.booked_count, active = excluded.active,
  updated_by_firebase_uid = excluded.updated_by_firebase_uid, updated_at = excluded.updated_at;
`;

  await writeFile(outFile, sql);
  console.log(`checks passed: ${slots.length} rows form a complete grid`);
  console.log(`  areas=${areas.length} dates=${dates.length} windows=${windows.length} types=${types.join("/")}`);
  console.log(`  capacity=${capacity} bookedCount=${booked} active=${active}`);
  console.log(`  updatedAt runs=${runs.length}`);
  console.log(`SQL written to ${outFile} (${Buffer.byteLength(sql)} bytes)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
