import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Header from "@/components/layout/Header";
import type { BrandingSettings } from "@/types/settings";
import type { AdminRole } from "@/types/team";

// Closes the loop on the service-area value: settingsService writes it
// (settingsService.test.ts), the branding subscription feeds it into
// this context, and the header is what has to show it.
const branding = vi.hoisted(() => ({ value: null as BrandingSettings | null }));
const adminRole = vi.hoisted(() => ({ value: null as AdminRole | null }));

vi.mock("@/hooks/useBrandingSettings", () => ({
  useBrandingSettings: () => ({ settings: branding.value, loading: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, profile: { name: "Aman Saini" } }) }));
vi.mock("@/hooks/useAdminRole", () => ({ useAdminRole: () => ({ role: adminRole.value, loading: false }) }));
vi.mock("@/components/layout/ProfileMenu", () => ({ default: () => <div data-stub="profile" /> }));
vi.mock("@/components/layout/NotificationBell", () => ({ default: () => <div data-stub="bell" /> }));

function render(settings: Partial<BrandingSettings> | null, role: AdminRole | null = null): string {
  branding.value = settings ? ({ businessName: "Metro Health Lab", ...settings } as BrandingSettings) : null;
  adminRole.value = role;
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

  it("keeps the greeting and the search control alongside it", () => {
    const html = render({ city: "Ghaziabad, UP" });
    expect(html).toContain("Hi, Aman");
    expect(html).toContain("search-input-mobile");
    expect(html).toContain("Search for tests, packages, scans...");
  });

  // The bookings shortcut was deliberately dropped from the header: a
  // fourth icon wrapped the wordmark onto two lines at 375px, and the
  // mobile bottom nav already carries a Bookings tab (see BottomNav),
  // so the capability is unchanged - only the duplicate entry point is
  // gone.
  it("does not duplicate the bottom nav bookings shortcut in the header", () => {
    expect(render({ city: "Ghaziabad, UP" })).not.toContain(String.raw`aria-label="My bookings"`);
  });
});

describe("Header admin panel entry point", () => {
  // Part of the same fail-safe as the Profile page's own admin link:
  // hiding/showing this is UX convenience only, never the boundary —
  // AdminProtectedRoute + RLS are what actually stop an unauthorized
  // request. But a plain customer must never even SEE the link.
  it("shows nothing for a signed-out visitor or a plain customer", () => {
    expect(render(null, null)).not.toContain("mh-header__admin-link");
  });

  it("shows a real, obvious Admin Panel link for each staff role, pointing at the right home", () => {
    const admin = render(null, "ADMIN");
    expect(admin).toContain("mh-header__admin-link");
    expect(admin).toContain('href="/admin"');
    expect(admin).toContain("Admin Dashboard");

    const agent = render(null, "COLLECTION_AGENT");
    expect(agent).toContain("mh-header__admin-link");
    expect(agent).toContain('href="/agent"');
    expect(agent).toContain("My Collections");
  });
});
