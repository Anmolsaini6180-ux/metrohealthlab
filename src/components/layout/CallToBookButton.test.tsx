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
  // The live project has no branding document at all, which is exactly
  // the state this has to survive without rendering a dead button.
  it("renders nothing when branding has not been configured", () => {
    expect(render(null)).toBe("");
  });

  it("renders nothing when no phone number is set", () => {
    expect(render({})).toBe("");
    expect(render({ phone: "" })).toBe("");
    expect(render({ phone: "   " })).toBe("");
  });

  it("renders a real tel: link once a phone number exists", () => {
    const html = render({ phone: "+91 99999 88888" });
    expect(html).toContain('href="tel:+919999988888"');
    expect(html).toContain("Call our health experts");
    expect(html).toContain("mh-call-card");
  });

  it("strips human formatting from the dial target but keeps the leading +", () => {
    expect(render({ phone: "+91 (120) 456-7890" })).toContain('href="tel:+911204567890"');
    expect(render({ phone: "0120 456 7890" })).toContain('href="tel:01204567890"');
  });

  it("renders nothing when the phone number contains no dialable digits", () => {
    expect(render({ phone: "call us!" })).toBe("");
  });

  it("labels the control for screen readers with the number", () => {
    expect(render({ phone: "+91 99999 88888" })).toContain('aria-label="Call +91 99999 88888 to book"');
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
