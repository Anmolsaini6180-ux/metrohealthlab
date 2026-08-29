import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateBrandingSettings } from "@/services/settingsService";

const fs = vi.hoisted(() => {
  class FakeFieldValue {
    constructor(readonly kind: string) {}
  }
  return {
    DELETE_SENTINEL: new FakeFieldValue("deleteField"),
    SERVER_TS: new FakeFieldValue("serverTimestamp"),
    writes: [] as { data: Record<string, unknown>; options: unknown }[],
  };
});

vi.mock("firebase/firestore", () => ({
  setDoc: async (_ref: unknown, data: Record<string, unknown>, options: unknown) => {
    fs.writes.push({ data, options });
  },
  doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` }),
  deleteField: () => fs.DELETE_SENTINEL,
  serverTimestamp: () => fs.SERVER_TS,
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock("@/firebase/firestore", () => ({ getDb: () => ({}) }));

const ACTOR = "admin-uid-1";

const lastWrite = () => fs.writes[fs.writes.length - 1];

function expectNoUndefinedValues(payload: Record<string, unknown>, path = "") {
  for (const [key, value] of Object.entries(payload)) {
    expect(value, `field "${path}${key}" must not be undefined`).not.toBeUndefined();
    if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      expectNoUndefinedValues(value as Record<string, unknown>, `${path}${key}.`);
    }
  }
}

beforeEach(() => {
  fs.writes.length = 0;
});

describe("updateBrandingSettings", () => {
  it("writes only the fields that have a value, and always merges", async () => {
    await updateBrandingSettings(ACTOR, {
      businessName: "  Metro Health Lab  ",
      tagline: "Accurate tests. Better health.",
      logoUrl: "",
      faviconUrl: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
    });

    const { data, options } = lastWrite();
    expect(options).toEqual({ merge: true });
    expect(data.businessName).toBe("Metro Health Lab");
    expect(data.tagline).toBe("Accurate tests. Better health.");
    expect(data.updatedBy).toBe(ACTOR);
    expect(data.updatedAt).toBe(fs.SERVER_TS);
    expectNoUndefinedValues(data);
  });

  // merge:true means an omitted key keeps the stored value, so a
  // cleared box has to be an explicit delete or clearing silently fails.
  it("clears a blanked field with deleteField(), not by omitting it", async () => {
    await updateBrandingSettings(ACTOR, { businessName: "Metro Health Lab", tagline: "" });

    const { data } = lastWrite();
    expect(data.tagline).toBe(fs.DELETE_SENTINEL);
    expect("tagline" in data).toBe(true);
    expectNoUndefinedValues(data);
  });

  it("removes a logo when the uploader's Clear button empties it", async () => {
    await updateBrandingSettings(ACTOR, { logoUrl: "" });
    expect(lastWrite().data.logoUrl).toBe(fs.DELETE_SENTINEL);
  });

  it("leaves a field alone when the caller does not mention it", async () => {
    await updateBrandingSettings(ACTOR, { tagline: "New tagline" });

    const { data } = lastWrite();
    expect(data).toEqual({ tagline: "New tagline", updatedBy: ACTOR, updatedAt: fs.SERVER_TS });
    expect("logoUrl" in data).toBe(false);
    expect("phone" in data).toBe(false);
  });

  it("handles the nested social links the same way", async () => {
    await updateBrandingSettings(ACTOR, {
      socialLinks: { facebook: "https://facebook.com/metrohealth", instagram: "", twitter: "  " },
    });

    const { data } = lastWrite();
    const social = data.socialLinks as Record<string, unknown>;
    expect(social.facebook).toBe("https://facebook.com/metrohealth");
    expect(social.instagram).toBe(fs.DELETE_SENTINEL);
    expect(social.twitter).toBe(fs.DELETE_SENTINEL);
    // youtube/linkedin were never mentioned by this form.
    expect("youtube" in social).toBe(false);
    expect("linkedin" in social).toBe(false);
    expectNoUndefinedValues(data);
  });

  // The service area shown beside the mobile wordmark. Same three-way
  // contract as every other optional branding field.
  it("saves the service area city typed into the branding form", async () => {
    await updateBrandingSettings(ACTOR, { businessName: "Metro Health Lab", city: "Ghaziabad, UP" });

    const { data, options } = lastWrite();
    expect(data.city).toBe("Ghaziabad, UP");
    expect(options).toEqual({ merge: true });
    expectNoUndefinedValues(data);
  });

  it("trims the city before storing it", async () => {
    await updateBrandingSettings(ACTOR, { city: "  Ghaziabad, UP  " });
    expect(lastWrite().data.city).toBe("Ghaziabad, UP");
  });

  it("removes the city with deleteField() when the admin clears the box", async () => {
    await updateBrandingSettings(ACTOR, { city: "" });
    expect(lastWrite().data.city).toBe(fs.DELETE_SENTINEL);
  });

  it("leaves a stored city untouched when the form does not mention it", async () => {
    await updateBrandingSettings(ACTOR, { phone: "+91 99999 88888" });
    expect("city" in lastWrite().data).toBe(false);
  });

  it("does not write a socialLinks key at all when none were mentioned", async () => {
    await updateBrandingSettings(ACTOR, { businessName: "Metro Health Lab" });
    expect("socialLinks" in lastWrite().data).toBe(false);
  });

  // The exact payload the branding form produces after the fix — every
  // optional box empty. This is what used to throw "Unsupported field
  // value: undefined".
  it("survives a full save where the admin left every optional box empty", async () => {
    await updateBrandingSettings(ACTOR, {
      businessName: "Metro Health Lab",
      tagline: "",
      logoUrl: "",
      faviconUrl: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      socialLinks: { facebook: "", instagram: "", twitter: "" },
    });

    const { data } = lastWrite();
    expectNoUndefinedValues(data);
    expect(data.businessName).toBe("Metro Health Lab");
    for (const key of ["tagline", "logoUrl", "faviconUrl", "phone", "whatsapp", "email", "address"]) {
      expect(data[key], key).toBe(fs.DELETE_SENTINEL);
    }
  });
});
