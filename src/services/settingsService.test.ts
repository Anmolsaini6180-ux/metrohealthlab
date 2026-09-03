import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the Supabase client's query-builder shape rather than the real
// network: a chainable object whose .select/.eq/.maybeSingle resolves
// the "current settings" read, and whose .upsert captures exactly what
// updateBrandingSettings tried to write, so assertions can inspect the
// merged jsonb payload without a live database.
const state = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  upserts: [] as { row: Record<string, unknown>; options: unknown }[],
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { data: state.current }, error: null }),
        }),
      }),
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        state.upserts.push({ row, options });
        return { error: null };
      },
    }),
  }),
}));

const { updateBrandingSettings } = await import("@/services/settingsService");

const ACTOR = "admin-uid-1";
const lastUpsert = () => state.upserts[state.upserts.length - 1];
const lastData = () => lastUpsert().row.data as Record<string, unknown>;

beforeEach(() => {
  state.current = {};
  state.upserts.length = 0;
});

describe("updateBrandingSettings", () => {
  it("writes only the fields that have a value, into settings.data as jsonb", async () => {
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

    const { row, options } = lastUpsert();
    expect(options).toEqual({ onConflict: "id" });
    expect(row.id).toBe("branding");
    expect(row.updated_by_firebase_uid).toBe(ACTOR);
    const data = lastData();
    expect(data.businessName).toBe("Metro Health Lab");
    expect(data.tagline).toBe("Accurate tests. Better health.");
  });

  // With a jsonb column there is no deleteField() sentinel: a cleared
  // box is achieved by the key being ABSENT from the merged object.
  it("clears a blanked field by omitting the key, not by writing an empty string", async () => {
    state.current = { businessName: "Metro Health Lab", tagline: "Old tagline" };
    await updateBrandingSettings(ACTOR, { businessName: "Metro Health Lab", tagline: "" });

    const data = lastData();
    expect("tagline" in data).toBe(false);
  });

  it("removes a logo when the uploader's Clear button empties it", async () => {
    state.current = { logoUrl: "https://old-logo" };
    await updateBrandingSettings(ACTOR, { logoUrl: "" });
    expect("logoUrl" in lastData()).toBe(false);
  });

  it("leaves a field alone when the caller does not mention it", async () => {
    state.current = { logoUrl: "https://existing-logo", phone: "+911234567890" };
    await updateBrandingSettings(ACTOR, { tagline: "New tagline" });

    const data = lastData();
    expect(data.tagline).toBe("New tagline");
    expect(data.logoUrl).toBe("https://existing-logo");
    expect(data.phone).toBe("+911234567890");
  });

  it("handles the nested social links the same way", async () => {
    state.current = { socialLinks: { youtube: "https://youtube.com/existing" } };
    await updateBrandingSettings(ACTOR, {
      socialLinks: { facebook: "https://facebook.com/metrohealth", instagram: "", twitter: "  " },
    });

    const social = lastData().socialLinks as Record<string, unknown>;
    expect(social.facebook).toBe("https://facebook.com/metrohealth");
    expect("instagram" in social).toBe(false);
    expect("twitter" in social).toBe(false);
    // youtube was never mentioned by this form and must survive the merge.
    expect(social.youtube).toBe("https://youtube.com/existing");
  });

  // The service area shown beside the mobile wordmark. Same three-way
  // contract as every other optional branding field.
  it("saves the service area city typed into the branding form", async () => {
    await updateBrandingSettings(ACTOR, { businessName: "Metro Health Lab", city: "Ghaziabad, UP" });
    expect(lastData().city).toBe("Ghaziabad, UP");
    expect(lastUpsert().options).toEqual({ onConflict: "id" });
  });

  it("trims the city before storing it", async () => {
    await updateBrandingSettings(ACTOR, { city: "  Ghaziabad, UP  " });
    expect(lastData().city).toBe("Ghaziabad, UP");
  });

  it("removes the city when the admin clears the box", async () => {
    state.current = { city: "Old City" };
    await updateBrandingSettings(ACTOR, { city: "" });
    expect("city" in lastData()).toBe(false);
  });

  it("leaves a stored city untouched when the form does not mention it", async () => {
    state.current = { city: "Ghaziabad, UP" };
    await updateBrandingSettings(ACTOR, { phone: "+91 99999 88888" });
    expect(lastData().city).toBe("Ghaziabad, UP");
  });

  // The public About Us page copy. Same three-way contract as every
  // other optional branding field, and it must never be silently
  // fabricated by the service — only ever what the admin actually typed.
  it("saves the About Us page copy typed into the branding form", async () => {
    await updateBrandingSettings(ACTOR, { aboutText: "We are a diagnostics network serving Ghaziabad." });
    expect(lastData().aboutText).toBe("We are a diagnostics network serving Ghaziabad.");
  });

  it("removes the About Us copy when the admin clears the box", async () => {
    state.current = { aboutText: "Old copy" };
    await updateBrandingSettings(ACTOR, { aboutText: "" });
    expect("aboutText" in lastData()).toBe(false);
  });

  it("leaves stored About Us copy untouched when the form does not mention it", async () => {
    state.current = { aboutText: "Existing copy" };
    await updateBrandingSettings(ACTOR, { phone: "+91 99999 88888" });
    expect(lastData().aboutText).toBe("Existing copy");
  });

  it("does not write a socialLinks key at all when none were mentioned and none existed", async () => {
    await updateBrandingSettings(ACTOR, { businessName: "Metro Health Lab" });
    expect("socialLinks" in lastData()).toBe(false);
  });

  // The exact payload the branding form produces when the admin leaves
  // every optional box empty on a brand new project (no prior settings row).
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

    const data = lastData();
    expect(data.businessName).toBe("Metro Health Lab");
    for (const key of ["tagline", "logoUrl", "faviconUrl", "phone", "whatsapp", "email", "address", "socialLinks"]) {
      expect(key in data, key).toBe(false);
    }
  });
});
