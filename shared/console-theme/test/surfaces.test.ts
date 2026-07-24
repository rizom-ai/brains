import { describe, expect, it } from "bun:test";
import { deriveConsoleSurfaces } from "../src";

const route = (
  pluginId: string,
  fullPath: string,
): { pluginId: string; fullPath: string } => ({ pluginId, fullPath });

describe("deriveConsoleSurfaces", () => {
  const allSurfaceRoutes = [
    route("dashboard", "/dashboard"),
    route("web-chat", "/chat"),
    route("web-chat", "/chat/api/messages"),
    route("cms", "/cms"),
    route("cms", "/cms/api/types"),
    route("admin", "/admin"),
    route("admin", "/admin/assets/app.js"),
  ];

  it("shows every registered console surface to an admin caller", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "admin",
    });

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
      { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
      { id: "cms", label: "CMS", href: "/cms", isActive: false },
      { id: "admin", label: "Admin", href: "/admin", isActive: false },
    ]);
  });

  it("hides surfaces above a Trusted caller's permission level", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "trusted",
    });

    // Trusted sees public (dashboard) and trusted (chat), never admin-only CMS/Admin.
    expect(surfaces.map((s) => s.id)).toEqual(["dashboard", "web-chat"]);
  });

  it("shows a Public caller only public surfaces", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "public",
    });

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard"]);
  });

  it("fails closed to public-only when no permission level is given", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
    });

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard"]);
  });

  it("always shows the active self surface even above the caller's level", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "admin",
      permissionLevel: "public",
      self: { id: "admin", href: "/admin" },
    });

    // A caller on their own surface always keeps its door; nothing else leaks.
    expect(surfaces.map((s) => s.id)).toEqual(["dashboard", "admin"]);
  });

  it("marks the rendering surface active from any surface", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("web-chat", "/chat")],
      { activeId: "web-chat", permissionLevel: "admin" },
    );

    expect(surfaces.find((s) => s.id === "web-chat")?.isActive).toBe(true);
    expect(surfaces.find((s) => s.id === "dashboard")?.isActive).toBe(false);
  });

  it("omits surfaces whose plugin registered no routes", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("web-chat", "/chat")],
      { activeId: "dashboard", permissionLevel: "admin" },
    );

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard", "web-chat"]);
  });

  it("uses the shortest registered path as the surface door", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("cms", "/cms/api/entities/post"),
        route("cms", "/cms"),
        route("cms", "/cms/assets/app.js"),
      ],
      { activeId: "cms", permissionLevel: "admin" },
    );

    expect(surfaces.find((s) => s.id === "cms")?.href).toBe("/cms");
  });

  it("keeps the rendering surface even without a readable registration", () => {
    const surfaces = deriveConsoleSurfaces([], {
      activeId: "dashboard",
      self: { id: "dashboard", href: "/dashboard" },
    });

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
    ]);
  });

  it("prefers the self-declared door over the registry's", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard/deep/route")],
      {
        activeId: "dashboard",
        self: { id: "dashboard", href: "/custom-dashboard" },
      },
    );

    expect(surfaces.find((s) => s.id === "dashboard")?.href).toBe(
      "/custom-dashboard",
    );
  });

  it("ignores routes from non-surface plugins", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("site-builder", "/")],
      { activeId: "dashboard" },
    );

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard"]);
  });
});
