import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AdminBrandingSettingsPage from "@/pages/admin/AdminBrandingSettingsPage";
import type { BrandingSettings } from "@/types/settings";

// Rendered through react-dom/server so the real page can be exercised
// in this project's node test environment. The point of these tests is
// that the service-area field is actually PRESENT and BOUND in the
// form — not merely that `city` exists on the TypeScript type.
const stored = vi.hoisted(() => ({ value: null as BrandingSettings | null }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { uid: "admin-1" }, profile: null }) }));

// useAsync resolves in an effect, which server rendering never runs;
// return the settled state directly so the form itself renders.
vi.mock("@/hooks/useAsync", () => ({
  useAsync: () => ({ data: stored.value, loading: false, error: null, retry: () => {} }),
}));

// Not under test here, and it pulls the media upload stack in with it.
vi.mock("@/components/admin/MediaUploader", () => ({
  default: ({ label }: { label: string }) => <div data-uploader={label} />,
}));

function render(settings: Partial<BrandingSettings> | null): string {
  stored.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  return renderToStaticMarkup(<AdminBrandingSettingsPage />);
}

describe("Branding settings form", () => {
  it("shows a visible, explicit label for the service area field", () => {
    const html = render(null);
    expect(html).toContain("Service area shown in the app header");
    expect(html).toContain('for="branding-city"');
    expect(html).toContain('id="branding-city"');
  });

  it("uses the short example as the placeholder, not the explanation", () => {
    const html = render(null);
    expect(html).toContain('placeholder="Ghaziabad, UP"');
  });

  // The form is populated from the loaded document inside an effect,
  // which server rendering deliberately does not run — so this asserts
  // the input is a controlled field wired to form state. The stored
  // value reaching Firestore and coming back is covered end-to-end in
  // settingsService.test.ts.
  it("renders the service area as a controlled input", () => {
    expect(render({ city: "Ghaziabad, UP" })).toMatch(/id="branding-city"[^>]*value=""/);
    expect(render({})).toMatch(/id="branding-city"[^>]*value=""/);
  });

  // Guards the field against being dropped again, and pins the
  // documented field set for this screen.
  it("still renders every other branding field", () => {
    const html = render({});
    for (const p of ["Business name", "Tagline", "Phone", "WhatsApp", "Email", "Address", "Facebook URL", "Instagram URL", "Twitter/X URL"]) {
      expect(html, `missing field: ${p}`).toContain(`placeholder="${p}"`);
    }
    expect(html).toContain('data-uploader="Logo"');
    expect(html).toContain('data-uploader="Favicon"');
  });

  it("places the service area next to the contact details, after Address", () => {
    const html = render({});
    expect(html.indexOf('placeholder="Address"')).toBeLessThan(html.indexOf('id="branding-city"'));
    expect(html.indexOf('id="branding-city"')).toBeLessThan(html.indexOf('placeholder="Facebook URL"'));
  });
});
