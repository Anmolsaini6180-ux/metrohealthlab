// Splits the generated import into chunks small enough for one round
// trip, without breaking a statement in half.
//
// Each chunk is still a complete set of idempotent upserts, and chunks
// stay in FK-safe order, so a chunk that fails can simply be re-run
// after the cause is fixed — nothing half-applies within a statement.
//
// Usage: node scripts/migration/split-sql.mjs <in.sql> <outDir> [maxRows]

import { readFile, writeFile, mkdir } from "node:fs/promises";

const HEAD = /^insert into public\.(\w+) \(([^)]+)\) values$/;

async function main() {
  const [inFile, outDir, maxRowsArg] = process.argv.slice(2);
  if (!inFile || !outDir) throw new Error("Usage: node split-sql.mjs <in.sql> <outDir> [maxRows]");
  const maxRows = Number(maxRowsArg ?? 150);

  const lines = (await readFile(inFile, "utf8")).split("\n");
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const m = HEAD.exec(line.trim());

    if (!m) {
      // begin/commit are dropped: each chunk is sent separately, so a
      // transaction spanning chunks is not possible anyway.
      const t = line.trim();
      if (t && t !== "begin;" && t !== "commit;" && !t.startsWith("--")) {
        chunks.push({ table: "raw", sql: t });
      }
      i += 1;
      continue;
    }

    const [, table, cols] = m;
    const rows = [];
    i += 1;
    while (i < lines.length && !lines[i].startsWith("on conflict")) {
      rows.push(lines[i].replace(/,$/, ""));
      i += 1;
    }
    const tail = lines[i]; // "on conflict (...) do ...;"
    i += 1;

    for (let s = 0; s < rows.length; s += maxRows) {
      const batch = rows.slice(s, s + maxRows);
      chunks.push({
        table,
        sql: `insert into public.${table} (${cols}) values\n${batch.join(",\n")}\n${tail}`,
      });
    }
  }

  await mkdir(outDir, { recursive: true });
  const index = [];
  for (const [k, c] of chunks.entries()) {
    const name = `${String(k).padStart(3, "0")}-${c.table}.sql`;
    await writeFile(`${outDir}/${name}`, c.sql);
    index.push({ name, table: c.table, bytes: Buffer.byteLength(c.sql) });
  }

  await writeFile(`${outDir}/index.json`, JSON.stringify(index, null, 2));
  console.log(`${chunks.length} chunk(s) written to ${outDir}`);
  for (const x of index) console.log(`  ${x.name}  ${x.bytes} bytes`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
