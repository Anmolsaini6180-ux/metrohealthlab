import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CallToBookButton from "@/components/layout/CallToBookButton";
import type { BrandingSettings } from "@/types/settings";

// Rendered through react-dom/server so the real component can be
// exercised in the node test environment this project already uses —
// no DOM library, and no new dependency, just for a button.
const branding = vi.hoisted(() => ({ value: null as BrandingSettings | null }));

vi.mock("@/hooks/useBrandingSettings", () => ({
  useBrandingSettings: () => ({ settings: branding.value, loading: false }),
}));

function render(settings: Partial<BrandingSettings> | null): string {
  branding.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  return renderToStaticMarkup(<CallToBookButton />);
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
    expect(html).toContain("Call to Book");
    expect(html).toContain("mh-call-fab");
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
});
