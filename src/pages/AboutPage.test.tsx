import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import AboutPage from "@/pages/AboutPage";
import type { BrandingSettings } from "@/types/settings";

// Rendered through react-dom/server, same pattern as the other
// branding-driven components in this project. AboutPage now renders
// <Seo> (react-helmet-async's <Helmet> under the hood), which throws
// without a HelmetProvider ancestor — wrapping it here is the correct
// fix, not a workaround: the real app always has exactly one
// HelmetProvider at its root (see main.tsx), so this makes the test
// match production, not paper over a real bug.
const branding = vi.hoisted(() => ({ value: null as BrandingSettings | null }));

vi.mock("@/hooks/useBrandingSettings", () => ({
  useBrandingSettings: () => ({ settings: branding.value, loading: false }),
}));

function render(settings: Partial<BrandingSettings> | null): string {
  branding.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  return renderToStaticMarkup(
    <HelmetProvider>
      <AboutPage />
    </HelmetProvider>
  );
}

describe("AboutPage", () => {
  // No admin has ever written real "About us" copy for this business —
  // this is the actual production state today, and it must never show
  // a raw "replace this placeholder" developer note to a real visitor.
  it("shows a real, generic-but-true description when no admin copy is set", () => {
    const html = render(null);
    expect(html).not.toContain("Replace this placeholder");
    expect(html).toContain("home sample collection");
  });

  it("shows the admin's own About Us copy once one is saved", () => {
    const html = render({ aboutText: "Metro Health Lab has served Ghaziabad since 2019." });
    expect(html).toContain("Metro Health Lab has served Ghaziabad since 2019.");
    expect(html).not.toContain("home sample collection");
  });

  it("titles the page with the real configured business name", () => {
    expect(render({ businessName: "Apollo Metro Diagnostics" })).toContain("About Apollo Metro Diagnostics");
  });

  it("renders no contact block when nothing is configured", () => {
    expect(render(null)).not.toContain("Reach us");
  });

  it("renders only the contact fields that are actually configured", () => {
    const html = render({ phone: "+91 99999 88888" });
    expect(html).toContain("Reach us");
    expect(html).toContain('href="tel:+919999988888"');
    expect(html).not.toContain("Email");
    expect(html).not.toContain("Address");
  });
});
