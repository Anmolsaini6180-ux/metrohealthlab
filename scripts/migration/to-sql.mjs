// Transforms exported Firestore JSON into idempotent Postgres upserts.
//
// Every statement is INSERT ... ON CONFLICT DO UPDATE, so running the
// import twice converges rather than duplicating. Firestore document ids
// become the Postgres primary keys, so slugs and existing links survive
// the migration untouched.
//
// Usage: node scripts/migration/to-sql.mjs <exportDir> <outFile>

import { readFile, writeFile } from "node:fs/promises";

const SQ = String.fromCharCode(39); // single quote, kept out of literals

/**
 * SQL string literal. Quotes are doubled; newlines, tabs and backslashes
 * become escape sequences in an E'' string so that a row NEVER spans
 * more than one physical line. Article bodies contain real newlines, and
 * the chunk splitter works line by line — a multi-line literal would be
 * torn in half and silently rewritten.
 */
const q = (v) => {
  if (v === undefined || v === null || v === "") return "null";
  const s = String(v);
  const quoted = s.split(SQ).join(SQ + SQ);
  if (!/[\\\r\n\t]/.test(s)) return SQ + quoted + SQ;
  const escaped = quoted
    .split("\\").join("\\\\")
    .split("\r").join("\\r")
    .split("\n").join("\\n")
    .split("\t").join("\\t");
  return `E${SQ}${escaped}${SQ}`;
};
const n = (v) => (v === undefined || v === null || Number.isNaN(Number(v)) ? "null" : Number(v));
const b = (v) => (v === true ? "true" : v === false ? "false" : "null");
const dt = (v) => (v ? `${q(v)}::date` : "null");
const j = (v) => (v === undefined || v === null ? "null" : `${q(JSON.stringify(v))}::jsonb`);

/**
 * Timestamp literal. created_at/updated_at are NOT NULL in Postgres, so
 * a document Firestore never stamped falls back to the import time —
 * writing `null` would defeat the column default and fail the insert.
 * created_at is immutable on re-import (see IMMUTABLE below), so only
 * updated_at can move, and only for rows that carry no source stamp.
 */
const ts = (v) => (v ? `${q(v)}::timestamptz` : "null");
const tsReq = (v) => (v ? `${q(v)}::timestamptz` : "now()");

// Columns that must keep the value from the first import rather than
// being rewritten every time the script runs.
const IMMUTABLE = ["created_at"];

/** INSERT ... ON CONFLICT DO UPDATE for every non-key column. */
function upsert(table, cols, rows, conflict = "id") {
  if (rows.length === 0) return `-- ${table}: no rows\n\n`;
  const keys = conflict.split(",").map((s) => s.trim());
  const updatable = cols.filter((c) => !keys.includes(c) && !IMMUTABLE.includes(c));
  const rendered = rows.map((r) => `  (${cols.map((c) => r[c]).join(", ")})`);
  // The splitter is line-oriented; a row spanning lines would be torn.
  const multiline = rendered.find((r) => r.includes("\n"));
  if (multiline) throw new Error(`${table}: row spans multiple lines: ${multiline.slice(0, 120)}`);
  const values = rendered.join(",\n");
  const action = updatable.length
    ? `do update set ${updatable.map((c) => `${c} = excluded.${c}`).join(", ")}`
    : "do nothing";
  return `insert into public.${table} (${cols.join(", ")}) values\n${values}\non conflict (${conflict}) ${action};\n\n`;
}

const load = async (dir, name) => JSON.parse(await readFile(`${dir}/${name}.json`, "utf8"));

async function main() {
  const [dir, outFile] = process.argv.slice(2);
  if (!dir || !outFile) throw new Error("Usage: node to-sql.mjs <exportDir> <outFile>");

  const cats = await load(dir, "testCategories");
  const tests = await load(dir, "tests");
  const pkgs = await load(dir, "packages");
  const labs = await load(dir, "labs");
  const lp = await load(dir, "labPricing");
  const areas = await load(dir, "serviceAreas");
  const slots = await load(dir, "slots");
  const offers = await load(dir, "offers");
  const banners = await load(dir, "banners");
  const articles = await load(dir, "articles");
  const settings = await load(dir, "settings");

  const catIds = new Set(cats.map((c) => c.id));
  const testIds = new Set(tests.map((t) => t.id));
  const notes = [];

  let sql = "begin;\n\n";

  sql += upsert("test_categories",
    ["id", "name", "slug", "subtitle", "icon", "display_order", "active", "updated_by_firebase_uid", "updated_at"],
    cats.map((c) => ({
      id: q(c.id), name: q(c.name), slug: q(c.slug), subtitle: q(c.subtitle), icon: q(c.icon),
      display_order: n(c.displayOrder ?? 0), active: b(c.active ?? true),
      updated_by_firebase_uid: q(c.updatedBy), updated_at: tsReq(c.updatedAt),
    })));

  sql += upsert("tests",
    ["id", "category_id", "name", "short_name", "slug", "description", "sample_type", "fasting_required",
     "preparation", "home_collection", "center_collection", "report_tat", "mrp", "selling_price", "gender",
     "age_group", "display_order", "active", "updated_by_firebase_uid", "created_at", "updated_at"],
    tests.map((t) => {
      // A categoryId pointing at a category that does not exist would
      // violate the FK. The row is KEPT (production data is never
      // dropped) with a null category, so it can be re-filed in admin.
      const orphan = t.categoryId && !catIds.has(t.categoryId);
      if (orphan) {
        notes.push(`test ${t.id} ("${t.name}") had categoryId "${t.categoryId}" which does not exist -> imported with category_id = NULL`);
      }
      return {
        id: q(t.id), category_id: orphan ? "null" : q(t.categoryId), name: q(t.name), short_name: q(t.shortName),
        slug: q(t.slug), description: q(t.description), sample_type: q(t.sampleType),
        fasting_required: b(t.fastingRequired ?? false), preparation: q(t.preparation),
        home_collection: b(t.homeCollection ?? true), center_collection: b(t.centerCollection ?? true),
        report_tat: q(t.reportTat), mrp: n(t.mrp ?? 0), selling_price: n(t.sellingPrice ?? 0),
        gender: q(t.gender), age_group: q(t.ageGroup), display_order: n(t.displayOrder ?? 0),
        active: b(t.active ?? true), updated_by_firebase_uid: q(t.updatedBy),
        created_at: tsReq(t.createdAt), updated_at: tsReq(t.updatedAt),
      };
    }));

  sql += upsert("packages",
    ["id", "name", "slug", "category", "description", "mrp", "selling_price", "report_tat", "home_collection",
     "rating", "tag", "display_order", "active", "updated_by_firebase_uid", "created_at", "updated_at"],
    pkgs.map((p) => ({
      id: q(p.id), name: q(p.name), slug: q(p.slug), category: q(p.category), description: q(p.description),
      mrp: n(p.mrp ?? 0), selling_price: n(p.sellingPrice ?? 0), report_tat: q(p.reportTat),
      home_collection: b(p.homeCollection ?? true), rating: n(p.rating), tag: q(p.tag),
      display_order: n(p.displayOrder ?? 0), active: b(p.active ?? true),
      updated_by_firebase_uid: q(p.updatedBy), created_at: tsReq(p.createdAt), updated_at: tsReq(p.updatedAt),
    })));

  sql += upsert("labs",
    ["id", "name", "description", "active", "updated_by_firebase_uid", "created_at", "updated_at"],
    labs.map((l) => ({
      id: q(l.id), name: q(l.name), description: q(l.description), active: b(l.active ?? true),
      updated_by_firebase_uid: q(l.updatedBy), created_at: tsReq(l.createdAt), updated_at: tsReq(l.updatedAt),
    })));

  // packages.testIds[] -> join table. Rebuilt wholesale for the packages
  // in this import so a test removed from a package does not linger.
  const pkgTests = pkgs.flatMap((p) =>
    (p.testIds ?? []).filter((t) => testIds.has(t)).map((t) => ({ package_id: q(p.id), test_id: q(t) })));
  const droppedRefs = pkgs.flatMap((p) => (p.testIds ?? []).filter((t) => !testIds.has(t)));
  if (droppedRefs.length) {
    notes.push(`${droppedRefs.length} package->test reference(s) pointed at tests that do not exist and were skipped`);
  }
  if (pkgs.length) {
    sql += `delete from public.package_tests where package_id in (${pkgs.map((p) => q(p.id)).join(", ")});\n`;
  }
  sql += upsert("package_tests", ["package_id", "test_id"], pkgTests, "package_id, test_id");

  sql += upsert("lab_pricing",
    ["id", "lab_id", "test_id", "package_id", "price", "mrp", "collection_type", "report_tat", "active",
     "updated_by_firebase_uid", "created_at", "updated_at"],
    lp.map((r) => ({
      id: q(r.id), lab_id: q(r.labId), test_id: q(r.testId), package_id: q(r.packageId),
      price: n(r.price ?? 0), mrp: n(r.mrp), collection_type: q(r.collectionType), report_tat: q(r.reportTat),
      active: b(r.active ?? true), updated_by_firebase_uid: q(r.updatedBy),
      created_at: tsReq(r.createdAt), updated_at: tsReq(r.updatedAt),
    })));

  sql += upsert("service_areas",
    ["id", "pincode", "city", "area", "home_collection_available", "collection_fee", "active",
     "updated_by_firebase_uid"],
    areas.map((a) => ({
      id: q(a.id), pincode: q(a.pincode), city: q(a.city), area: q(a.area),
      home_collection_available: b(a.homeCollectionAvailable ?? true),
      collection_fee: n(a.collectionFee ?? 0), active: b(a.active ?? true),
      updated_by_firebase_uid: q(a.updatedBy),
    })));

  sql += upsert("slots",
    ["id", "area_id", "date", "start_time", "end_time", "collection_type", "capacity", "booked_count",
     "active", "updated_by_firebase_uid", "updated_at"],
    slots.map((s) => ({
      id: q(s.id), area_id: q(s.areaId), date: dt(s.date), start_time: q(s.startTime), end_time: q(s.endTime),
      collection_type: q(s.collectionType ?? "home"), capacity: n(s.capacity ?? 0),
      booked_count: n(s.bookedCount ?? 0), active: b(s.active ?? true),
      updated_by_firebase_uid: q(s.updatedBy), updated_at: tsReq(s.updatedAt),
    })));

  sql += upsert("offers",
    ["id", "title", "subtitle", "description", "discount_type", "discount_value", "coupon_code", "image_url",
     "start_at", "end_at", "featured", "display_order", "active", "updated_by_firebase_uid", "updated_at"],
    offers.map((o) => ({
      id: q(o.id), title: q(o.title), subtitle: q(o.subtitle), description: q(o.description),
      discount_type: q(o.discountType), discount_value: n(o.discountValue), coupon_code: q(o.couponCode),
      image_url: q(o.imageUrl), start_at: dt(o.startAt), end_at: dt(o.endAt),
      featured: b(o.featured ?? false), display_order: n(o.displayOrder ?? 0), active: b(o.active ?? true),
      updated_by_firebase_uid: q(o.updatedBy), updated_at: tsReq(o.updatedAt),
    })));

  sql += upsert("banners",
    ["id", "title", "subtitle", "cta_label", "cta_link", "image_url", "start_at", "end_at", "display_order",
     "active", "updated_by_firebase_uid", "updated_at"],
    banners.map((x) => ({
      id: q(x.id), title: q(x.title), subtitle: q(x.subtitle), cta_label: q(x.ctaLabel), cta_link: q(x.ctaLink),
      image_url: q(x.imageUrl), start_at: dt(x.startAt), end_at: dt(x.endAt),
      display_order: n(x.displayOrder ?? 0), active: b(x.active ?? true),
      updated_by_firebase_uid: q(x.updatedBy), updated_at: tsReq(x.updatedAt),
    })));

  sql += upsert("articles",
    ["id", "title", "slug", "category", "excerpt", "body", "cover_image", "active", "published_at",
     "updated_by_firebase_uid", "updated_at"],
    articles.map((a) => ({
      id: q(a.id), title: q(a.title), slug: q(a.slug), category: q(a.category), excerpt: q(a.excerpt),
      body: q(a.body), cover_image: q(a.coverImage), active: b(a.active ?? true),
      published_at: ts(a.publishedAt), updated_by_firebase_uid: q(a.updatedBy), updated_at: tsReq(a.updatedAt),
    })));

  // settings/{id} keeps its whole document as jsonb; the branding
  // service reads named fields out of it after the service migration.
  sql += upsert("settings", ["id", "data", "updated_by_firebase_uid", "updated_at"],
    settings.map((s) => {
      const rest = { ...s };
      delete rest.id;
      delete rest.updatedBy;
      delete rest.updatedAt;
      return { id: q(s.id), data: j(rest), updated_by_firebase_uid: q(s.updatedBy), updated_at: tsReq(s.updatedAt) };
    }));

  sql += "commit;\n";

  await writeFile(outFile, sql);
  console.log(`SQL written to ${outFile}`);
  console.log(`statements: ${(sql.match(/insert into/g) ?? []).length} inserts`);
  if (notes.length) {
    console.log("\nTRANSFORMATION NOTES:");
    notes.forEach((x) => console.log(" -", x));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
