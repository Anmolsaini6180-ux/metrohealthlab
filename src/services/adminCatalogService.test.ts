import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestCategory, updateTestCategory } from "@/services/adminCatalogService";

// Hoisted so the vi.mock factory below (which runs before the imports)
// can reach it. FakeFieldValue mirrors a real Firestore sentinel: a
// class instance, which also proves stripUndefined() forwards it by
// reference instead of copying it field by field.
const fs = vi.hoisted(() => {
  class FakeFieldValue {
    constructor(readonly kind: string) {}
  }
  return {
    DELETE_SENTINEL: new FakeFieldValue("deleteField"),
    creates: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
  };
});

vi.mock("firebase/firestore", () => ({
  addDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    fs.creates.push(data);
    return { id: "generated-id" };
  },
  updateDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    fs.updates.push(data);
  },
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` }),
  deleteField: () => fs.DELETE_SENTINEL,
  serverTimestamp: () => ({ kind: "serverTimestamp" }),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/firebase/firestore", () => ({ getDb: () => ({}) }));

const ACTOR = "admin-uid-1";

function lastCreatePayload(): Record<string, unknown> {
  return fs.creates[fs.creates.length - 1];
}
function lastUpdatePayload(): Record<string, unknown> {
  return fs.updates[fs.updates.length - 1];
}

// Nothing at all may reach the SDK as `undefined` — that is the exact
// shape that produced "Function addDoc() called with invalid data.
// Unsupported field value: undefined (found in field icon ...)".
function expectNoUndefinedValues(payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    expect(value, `field "${key}" must not be undefined`).not.toBeUndefined();
  }
}

beforeEach(() => {
  fs.creates.length = 0;
  fs.updates.length = 0;
});

describe("createTestCategory", () => {
  it("omits the icon field entirely when no icon was chosen", async () => {
    await createTestCategory(ACTOR, {
      name: "Blood Tests",
      slug: "blood-tests",
      subtitle: "Up to 70% off",
      icon: "",
      active: true,
      displayOrder: 0,
    });

    const payload = lastCreatePayload();
    expect(payload).toEqual({
      name: "Blood Tests",
      slug: "blood-tests",
      subtitle: "Up to 70% off",
      active: true,
      displayOrder: 0,
      updatedBy: ACTOR,
    });
    expect("icon" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });

  it("writes the ligature name when an icon was chosen", async () => {
    await createTestCategory(ACTOR, {
      name: "Blood Tests",
      slug: "blood-tests",
      subtitle: "Up to 70% off",
      icon: "bloodtype",
      active: true,
      displayOrder: 0,
    });

    const payload = lastCreatePayload();
    expect(payload.icon).toBe("bloodtype");
    expectNoUndefinedValues(payload);
  });

  it("drops every blank optional field, not just the icon", async () => {
    await createTestCategory(ACTOR, { name: " Radiology ", slug: " radiology ", active: true });

    const payload = lastCreatePayload();
    expect(payload).toEqual({
      name: "Radiology",
      slug: "radiology",
      active: true,
      displayOrder: 0,
      updatedBy: ACTOR,
    });
    expect("icon" in payload).toBe(false);
    expect("subtitle" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });
});

describe("updateTestCategory", () => {
  it("changes the icon to another ligature", async () => {
    await updateTestCategory(ACTOR, "cat-1", { name: "Blood Tests", slug: "blood-tests", icon: "biotech" });

    const payload = lastUpdatePayload();
    expect(payload.icon).toBe("biotech");
    expectNoUndefinedValues(payload);
  });

  it("clears the icon with deleteField() rather than undefined or an empty string", async () => {
    await updateTestCategory(ACTOR, "cat-1", { name: "Blood Tests", slug: "blood-tests", icon: "" });

    const payload = lastUpdatePayload();
    // Forwarding the sentinel untouched is what actually removes the
    // field; an omitted key would silently keep the old icon.
    expect(payload.icon).toBe(fs.DELETE_SENTINEL);
    expectNoUndefinedValues(payload);
  });

  it("leaves the stored icon alone when the field is not part of the patch", async () => {
    await updateTestCategory(ACTOR, "cat-1", { active: false });

    const payload = lastUpdatePayload();
    expect(payload).toEqual({ active: false, updatedBy: ACTOR });
    expect("icon" in payload).toBe(false);
    expectNoUndefinedValues(payload);
  });

  it("always attributes the write to the calling admin (rules require it)", async () => {
    await updateTestCategory(ACTOR, "cat-1", { subtitle: "Flat 20% off" });
    expect(lastUpdatePayload().updatedBy).toBe(ACTOR);
  });
});
