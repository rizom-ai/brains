import { describe, expect, it } from "bun:test";
import { deriveConsoleSurfaces } from "../src";

const route = (
  pluginId: string,
  fullPath: string,
): { pluginId: string; fullPath: string } => ({ pluginId, fullPath });

describe("deriveConsoleSurfaces", () => {
  it("derives the canonical Studio door from the Studio plugin", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("studio", "/studio")],
      {
        activeId: "dashboard",
        permissionLevel: "trusted",
        hasActiveSession: true,
      },
    );

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
      {
        id: "studio",
        label: "Studio",
        href: "/studio",
        isActive: false,
        requiresActiveSession: true,
      },
    ]);
  });

  const allSurfaceRoutes = [
    route("dashboard", "/dashboard"),
    route("web-chat", "/chat"),
    route("web-chat", "/chat/api/messages"),
    route("studio", "/studio"),
    route("studio", "/studio/api/types"),
    route("admin", "/admin"),
    route("admin", "/admin/assets/app.js"),
  ];

  it("shows every registered console surface to an admin caller", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "admin",
      hasActiveSession: true,
    });

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
      {
        id: "web-chat",
        label: "Chat",
        href: "/chat",
        isActive: false,
        requiresActiveSession: true,
      },
      {
        id: "studio",
        label: "Studio",
        href: "/studio",
        isActive: false,
        requiresActiveSession: true,
      },
      {
        id: "admin",
        label: "Admin",
        href: "/admin",
        isActive: false,
        requiresActiveSession: true,
      },
    ]);
  });

  it("hides surfaces above a Trusted caller's permission level", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "trusted",
      hasActiveSession: true,
    });

    // Trusted sees public (dashboard) and trusted (chat, Studio), never the
    // admin-only Admin console.
    expect(surfaces.map((s) => s.id)).toEqual([
      "dashboard",
      "web-chat",
      "studio",
    ]);
  });

  it("shows an anonymous Public caller only session-free surfaces", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "public",
      hasActiveSession: false,
    });

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard"]);
  });

  it("shows Studio to an active Public-rank caller", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("dashboard", "/dashboard"),
        route("studio", "/studio"),
        route("account", "/account"),
      ],
      {
        activeId: "dashboard",
        permissionLevel: "public",
        hasActiveSession: true,
      },
    );

    expect(surfaces.map((surface) => surface.id)).toEqual([
      "dashboard",
      "studio",
      "account",
    ]);
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

  it("derives the account surface from the account plugin route", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("account", "/account")],
      {
        activeId: "account",
        permissionLevel: "trusted",
        hasActiveSession: true,
        self: { id: "account", href: "/account" },
      },
    );

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: false,
      },
      {
        id: "account",
        label: "Account",
        href: "/account",
        isActive: true,
        requiresActiveSession: true,
      },
    ]);
  });

  it("marks the rendering surface active from any surface", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("web-chat", "/chat")],
      {
        activeId: "web-chat",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    );

    expect(surfaces.find((s) => s.id === "web-chat")?.isActive).toBe(true);
    expect(surfaces.find((s) => s.id === "dashboard")?.isActive).toBe(false);
  });

  it("omits surfaces whose plugin registered no routes", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("web-chat", "/chat")],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    );

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard", "web-chat"]);
  });

  it("uses the shortest registered path as the surface door", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("studio", "/studio/api/entities/post"),
        route("studio", "/studio"),
        route("studio", "/studio/assets/app.js"),
      ],
      {
        activeId: "studio",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    );

    expect(surfaces.find((s) => s.id === "studio")?.href).toBe("/studio");
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
