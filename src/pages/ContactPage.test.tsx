import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import ContactPage from "@/pages/ContactPage";
import type { BrandingSettings } from "@/types/settings";

const branding = vi.hoisted(() => ({ value: null as BrandingSettings | null }));

vi.mock("@/hooks/useBrandingSettings", () => ({
  useBrandingSettings: () => ({ settings: branding.value, loading: false }),
}));

function render(settings: Partial<BrandingSettings> | null): string {
  branding.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  return renderToStaticMarkup(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>
  );
}

describe("ContactPage", () => {
  // The live production state before this fix: a hardcoded fake email
  // and a literal "Add your support number here" note shown to real
  // visitors. Neither must ever appear again.
  it("never shows the old hardcoded fake support email", () => {
    expect(render(null)).not.toContain("support@example.com");
  });

  it("never shows a raw developer placeholder note", () => {
    expect(render(null)).not.toContain("Add your support number here");
  });

  it("says contact details are not configured yet, rather than faking them", () => {
    // React HTML-escapes the apostrophe in the rendered markup.
    expect(render(null)).toContain("haven&#x27;t been added yet");
  });

  it("shows the real configured phone and email once an admin sets them", () => {
    const html = render({ phone: "+91 99999 88888", email: "help@metrohealthlab.in" });
    expect(html).toContain('href="tel:+919999988888"');
    expect(html).toContain('href="mailto:help@metrohealthlab.in"');
    expect(html).not.toContain("haven't been added yet");
  });

  it("always points to the in-app Support page for tracked tickets", () => {
    expect(render(null)).toContain('href="/support"');
  });
});
