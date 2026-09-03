import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the Supabase query-builder shape actually used by the new
// slot-assignment functions: .select().eq()...eq().order().order()
// .limit().maybeSingle() for a single lookup, and .select().eq().in()
// .eq().order().order() for the batch form. Filters/sorts are applied
// against an in-memory row set rather than a real database.
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));

function applyFilters(rows: Record<string, unknown>[], filters: { col: string; op: "eq" | "in"; value: unknown }[]) {
  return rows.filter((r) =>
    filters.every((f) => (f.op === "eq" ? r[f.col] === f.value : (f.value as unknown[]).includes(r[f.col])))
  );
}

function makeQuery(filters: { col: string; op: "eq" | "in"; value: unknown }[] = [], sorts: { col: string; asc: boolean }[] = []) {
  const query = {
    eq(col: string, value: unknown) {
      return makeQuery([...filters, { col, op: "eq" as const, value }], sorts);
    },
    in(col: string, value: unknown[]) {
      return makeQuery([...filters, { col, op: "in" as const, value }], sorts);
    },
    order(col: string, opts?: { ascending?: boolean }) {
      return makeQuery(filters, [...sorts, { col, asc: opts?.ascending !== false }]);
    },
    limit(_n: number) {
      return query;
    },
    async maybeSingle() {
      const rows = resolveRows();
      return { data: rows[0] ?? null, error: null };
    },
    then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
      resolve({ data: resolveRows(), error: null });
    },
  };
  function resolveRows() {
    let rows = applyFilters(state.rows, filters);
    for (const s of [...sorts].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[s.col] as number | string;
        const bv = b[s.col] as number | string;
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return s.asc ? cmp : -cmp;
      });
    }
    return rows;
  }
  return query;
}

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "media_assets") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => makeQuery(),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            const row = state.rows.find((r) => r.id === id);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
  }),
  safeSubscribe: (setup: () => () => void) => setup(),
}));

const { assignMedia, getAssignedMedia, getAssignedMediaMap, updateMediaMetadata } = await import("@/services/mediaService");

function row(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: "asset-1",
    public_id: "metro-health/tests/abc",
    asset_id: "abc",
    category: "tests",
    related_id: null,
    resource_type: "image",
    format: "jpg",
    bytes: 1024,
    width: 800,
    height: 600,
    folder: "tests",
    filename: "photo.jpg",
    secure_url: "https://res.cloudinary.com/demo/image/upload/photo.jpg",
    active: true,
    sort_order: 0,
    uploaded_by: null,
    uploaded_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.rows = [];
});

describe("getAssignedMedia", () => {
  it("returns null when nothing is assigned to this slot yet", async () => {
    expect(await getAssignedMedia("tests", "cat-1")).toBeNull();
  });

  it("finds the asset assigned to a specific category row", async () => {
    state.rows = [row({ id: "a1", related_id: "cat-1" }), row({ id: "a2", related_id: "cat-2" })];
    const found = await getAssignedMedia("tests", "cat-1");
    expect(found?.id).toBe("a1");
  });

  it("never returns a deactivated asset", async () => {
    state.rows = [row({ id: "a1", related_id: "cat-1", active: false })];
    expect(await getAssignedMedia("tests", "cat-1")).toBeNull();
  });

  it("prefers the lower sort_order when two assets share a slot", async () => {
    state.rows = [
      row({ id: "second", related_id: "cat-1", sort_order: 5 }),
      row({ id: "first", related_id: "cat-1", sort_order: 1 }),
    ];
    expect((await getAssignedMedia("tests", "cat-1"))?.id).toBe("first");
  });
});

describe("getAssignedMediaMap", () => {
  it("returns an empty map for an empty id list without querying", async () => {
    const map = await getAssignedMediaMap("tests", []);
    expect(map.size).toBe(0);
  });

  it("maps each category id to its own assigned asset, skipping unassigned ones", async () => {
    state.rows = [row({ id: "a1", related_id: "cat-1" }), row({ id: "a2", related_id: "cat-3" })];
    const map = await getAssignedMediaMap("tests", ["cat-1", "cat-2", "cat-3"]);
    expect(map.get("cat-1")?.id).toBe("a1");
    expect(map.has("cat-2")).toBe(false);
    expect(map.get("cat-3")?.id).toBe("a2");
  });
});

describe("assignMedia / updateMediaMetadata", () => {
  it("re-points an existing asset at a new slot", async () => {
    state.rows = [row({ id: "a1", category: "packages", related_id: "old-pkg" })];
    await assignMedia("a1", "tests", "cat-9");
    expect(state.rows[0]).toMatchObject({ category: "tests", related_id: "cat-9" });
  });

  it("updates only the metadata fields provided", async () => {
    state.rows = [row({ id: "a1", title: "Old title", alt_text: "Old alt" })];
    await updateMediaMetadata("a1", { title: "New title" });
    expect(state.rows[0]).toMatchObject({ title: "New title", alt_text: "Old alt" });
  });

  it("can deactivate an asset without deleting it", async () => {
    state.rows = [row({ id: "a1", active: true })];
    await updateMediaMetadata("a1", { active: false });
    expect(state.rows[0].active).toBe(false);
  });
});
