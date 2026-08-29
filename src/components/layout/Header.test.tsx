import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Header from "@/components/layout/Header";
import type { BrandingSettings } from "@/types/settings";

// Closes the loop on the service-area value: settingsService writes it
// (settingsService.test.ts), the branding subscription feeds it into
// this context, and the header is what has to show it.
const branding = vi.hoisted(() => ({ value: null as BrandingSettings | null }));

vi.mock("@/hooks/useBrandingSettings", () => ({
  useBrandingSettings: () => ({ settings: branding.value, loading: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, profile: { name: "Aman Saini" } }) }));
vi.mock("@/components/layout/ProfileMenu", () => ({ default: () => <div data-stub="profile" /> }));
vi.mock("@/components/layout/NotificationBell", () => ({ default: () => <div data-stub="bell" /> }));

function render(settings: Partial<BrandingSettings> | null): string {
  branding.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  return renderToStaticMarkup(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

describe("Header service-area chip", () => {
  it("shows the city configured in Branding Settings", () => {
    const html = render({ city: "Ghaziabad, UP" });
    expect(html).toContain("mh-header__city");
    expect(html).toContain("Ghaziabad, UP");
    expect(html).toContain("location_on");
  });

  // The live project currently has no branding document at all.
  it("renders no chip when branding is unset or the city is blank", () => {
    expect(render(null)).not.toContain("mh-header__city");
    expect(render({})).not.toContain("mh-header__city");
    expect(render({ city: "   " })).not.toContain("mh-header__city");
  });

  it("keeps the greeting and the bookings shortcut alongside it", () => {
    const html = render({ city: "Ghaziabad, UP" });
    expect(html).toContain("Hi, Aman");
    expect(html).toContain('aria-label="My bookings"');
    expect(html).toContain("tune");
  });
});
