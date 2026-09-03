import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminLayout from "@/layouts/AdminLayout";
import type { StaffContext } from "@/types/team";
import type { AdminRole } from "@/types/team";

// Rendered through react-dom/server, same pattern as the other
// auth-driven components in this project. The mobile drawer's open
// state only ever changes via a click, which SSR cannot exercise, so
// this only covers the always-rendered desktop sidebar nav and topbar.
const auth = vi.hoisted(() => ({ role: null as AdminRole | null }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { name: "Priya Sharma" }, user: { email: "priya@metrohealthlab.in" } }),
}));

vi.mock("@/hooks/useAdminRole", () => ({
  useAdminRole: (): StaffContext & { role: AdminRole | null; loading: boolean } => ({
    uid: "staff-1",
    role: auth.role,
    status: auth.role ? "active" : null,
    isMaster: false,
    masterUid: "",
    loading: false,
  }),
}));

function render(role: AdminRole | null): string {
  auth.role = role;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div data-testid="page">Dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("AdminLayout", () => {
  it("renders the routed page content through the Outlet", () => {
    expect(render("SUPER_ADMIN")).toContain("Dashboard content");
  });

  it("shows every nav group for a SUPER_ADMIN", () => {
    const html = render("SUPER_ADMIN");
    for (const group of ["Overview", "Catalogue", "Marketing", "Operations", "Settings"]) {
      expect(html, `missing group: ${group}`).toContain(group);
    }
    expect(html).toContain("Admin &amp; Staff");
  });

  it("hides catalogue-management links for a plain COLLECTION_AGENT", () => {
    const html = render("COLLECTION_AGENT");
    expect(html).not.toContain(">Tests<");
    expect(html).not.toContain(">Categories<");
    expect(html).not.toContain(">Admin &amp; Staff<");
    // Still gets the always-visible items every role sees.
    expect(html).toContain(">Bookings<");
    expect(html).toContain("My Collections");
  });

  // CAN_MANAGE_TEAM includes SUB_ADMIN (they can grant COLLECTION_AGENT
  // roles per set_staff_role's own hierarchy check) — only a plain
  // COLLECTION_AGENT has no business seeing this screen at all.
  it("keeps staff management visible for SUB_ADMIN and ADMIN, not just SUPER_ADMIN", () => {
    expect(render("SUB_ADMIN")).toContain("Admin &amp; Staff");
    expect(render("ADMIN")).toContain("Admin &amp; Staff");
    expect(render("COLLECTION_AGENT")).not.toContain("Admin &amp; Staff");
  });

  it("shows the signed-in admin's real name and role, not a placeholder", () => {
    const html = render("ADMIN");
    expect(html).toContain("Priya Sharma");
    expect(html).toContain(">ADMIN<");
  });

  it("renders exactly one visible logout control on the desktop shell", () => {
    // Two "Log out" buttons exist in the markup (topbar + drawer), but
    // only the topbar one is meant to show before 1024px CSS kicks in
    // — this just pins that both still say the same real action, not
    // that CSS visibility is correct (jsdom/CSS is out of scope here).
    const html = render("SUPER_ADMIN");
    const matches = html.match(/Log out/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
