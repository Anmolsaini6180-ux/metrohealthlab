import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import CallToBookButton from "@/components/layout/CallToBookButton";
import type { BrandingSettings } from "@/types/settings";

// Rendered through react-dom/server so the real component can be
// exercised in the node test environment this project already uses —
// no DOM library, and no new dependency, just for a button. The
// MemoryRouter is required because the component reads the current
// route: the card is home-only (see its own header comment).
const branding = vi.hoisted(() => ({ value: null as BrandingSettings | null }));

vi.mock("@/hooks/useBrandingSettings", () => ({
  useBrandingSettings: () => ({ settings: branding.value, loading: false }),
}));

function renderAt(path: string, settings: Partial<BrandingSettings> | null): string {
  branding.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <CallToBookButton />
    </MemoryRouter>
  );
}

function render(settings: Partial<BrandingSettings> | null): string {
  return renderAt("/", settings);
}

beforeEach(() => {
  branding.value = null;
});

describe("CallToBookButton", () => {
  // Real behaviour change: a "Request a callback" lead capture (see
  // publicLeadService.createCallbackLead) works independently of any
  // configured business phone number, so the card now degrades to a
  // callback-only version instead of disappearing entirely — a
  // callback-request card that dials nothing dialable is still useful;
  // one that offers no way at all to reach the business was the actual
  // problem the old "renders nothing" behaviour left unsolved.
  it("still offers a way to request a callback when branding has not been configured", () => {
    const html = render(null);
    expect(html).toContain("mh-call-card");
    expect(html).toContain("Request Callback");
    expect(html).not.toContain('href="tel:');
  });

  it("still offers a way to request a callback when no phone number is set", () => {
    for (const phone of [undefined, "", "   "]) {
      const html = render({ phone });
      expect(html).toContain("Request Callback");
      expect(html).not.toContain('href="tel:');
    }
  });

  it("renders a real tel: link once a phone number exists, alongside Request Callback", () => {
    const html = render({ phone: "+91 99999 88888" });
    expect(html).toContain('href="tel:+919999988888"');
    expect(html).toContain("Call our health experts");
    expect(html).toContain("Call Now");
    expect(html).toContain("Request Callback");
    expect(html).toContain("mh-call-card");
  });

  it("strips human formatting from the dial target but keeps the leading +", () => {
    expect(render({ phone: "+91 (120) 456-7890" })).toContain('href="tel:+911204567890"');
    expect(render({ phone: "0120 456 7890" })).toContain('href="tel:01204567890"');
  });

  it("still offers a way to request a callback when the phone number has no dialable digits", () => {
    const html = render({ phone: "call us!" });
    expect(html).toContain("Request Callback");
    expect(html).not.toContain('href="tel:');
  });

  it("labels the tap-to-call control for screen readers with the number", () => {
    expect(render({ phone: "+91 99999 88888" })).toContain('aria-label="Call +91 99999 88888 to book"');
  });

  it("always offers a way to dismiss the card", () => {
    expect(render(null)).toContain('aria-label="Close"');
    expect(render({ phone: "+91 99999 88888" })).toContain('aria-label="Close"');
  });

  // The card is full-width and fixed, so anywhere it is not wanted it
  // would cover that page's own primary action (Log in, Continue).
  it("renders only on the home route, even with a valid phone number", () => {
    const configured = { phone: "+91 99999 88888" };
    expect(renderAt("/", configured)).toContain("mh-call-card");
    expect(renderAt("/login", configured)).toBe("");
    expect(renderAt("/book", configured)).toBe("");
    expect(renderAt("/packages/full-body", configured)).toBe("");
  });
});
