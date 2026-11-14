import { describe, it, expect } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";
import { getCallerClaims, isCatalogManagerRole, requireCatalogManager } from "./roleClaims";
import { isMediaFolder, MEDIA_FOLDERS } from "./cloudinaryConfig";

// Builds a callable request whose claims live where a real signed ID
// token would put them.
function req(token?: Record<string, unknown>, uid?: string): CallableRequest<unknown> {
  return {
    auth: uid ? { uid, token: (token ?? {}) as never } : undefined,
    data: {},
    rawRequest: {} as never,
    acceptsStreaming: false,
  } as unknown as CallableRequest<unknown>;
}

describe("isCatalogManagerRole", () => {
  it("accepts only SUPER_ADMIN and ADMIN", () => {
    expect(isCatalogManagerRole("SUPER_ADMIN")).toBe(true);
    expect(isCatalogManagerRole("ADMIN")).toBe(true);
  });

  it("rejects the operational staff roles", () => {
    expect(isCatalogManagerRole("SUB_ADMIN")).toBe(false);
    expect(isCatalogManagerRole("COLLECTION_AGENT")).toBe(false);
  });

  it("rejects absent, empty and non-string roles", () => {
    expect(isCatalogManagerRole(undefined)).toBe(false);
    expect(isCatalogManagerRole(null)).toBe(false);
    expect(isCatalogManagerRole("")).toBe(false);
    expect(isCatalogManagerRole("super_admin")).toBe(false); // case matters
    expect(isCatalogManagerRole({ role: "ADMIN" })).toBe(false);
  });
});

describe("requireCatalogManager", () => {
  it("allows a SUPER_ADMIN and returns their uid", () => {
    const result = requireCatalogManager(req({ role: "SUPER_ADMIN" }, "uid-super"));
    expect(result).toEqual({ uid: "uid-super", role: "SUPER_ADMIN" });
  });

  it("allows an ADMIN", () => {
    expect(requireCatalogManager(req({ role: "ADMIN" }, "uid-admin")).role).toBe("ADMIN");
  });

  it("rejects an unauthenticated caller", () => {
    expect(() => requireCatalogManager(req())).toThrowError(/signed in/i);
  });

  it("rejects a signed-in customer with no role claim", () => {
    expect(() => requireCatalogManager(req({}, "uid-customer"))).toThrowError(/permission/i);
  });

  it("rejects a COLLECTION_AGENT trying to manage media", () => {
    expect(() => requireCatalogManager(req({ role: "COLLECTION_AGENT" }, "uid-agent"))).toThrowError(
      /permission/i
    );
  });

  it("rejects a SUB_ADMIN trying to manage media", () => {
    expect(() => requireCatalogManager(req({ role: "SUB_ADMIN" }, "uid-sub"))).toThrowError(/permission/i);
  });
});

describe("getCallerClaims", () => {
  it("reads the role only from the token, never from request data", () => {
    // A client can put anything in request.data — it must not matter.
    const request = req({ role: "COLLECTION_AGENT" }, "uid-1");
    (request as { data: unknown }).data = { role: "SUPER_ADMIN", adminId: "someone-else" };

    expect(getCallerClaims(request).role).toBe("COLLECTION_AGENT");
    expect(() => requireCatalogManager(request)).toThrowError(/permission/i);
  });
});

describe("media folder allowlist", () => {
  it("accepts every declared folder", () => {
    for (const folder of MEDIA_FOLDERS) {
      expect(isMediaFolder(folder)).toBe(true);
    }
  });

  it("rejects a folder outside the allowlist", () => {
    expect(isMediaFolder("metro-health/reports")).toBe(false);
    expect(isMediaFolder("metro-health/branding/../reports")).toBe(false);
    expect(isMediaFolder("")).toBe(false);
    expect(isMediaFolder(undefined)).toBe(false);
  });

  it("never authorizes the reports tree, which has its own signed flow", () => {
    expect((MEDIA_FOLDERS as readonly string[]).some((f) => f.includes("reports"))).toBe(false);
  });
});
