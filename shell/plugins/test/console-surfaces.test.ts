import { describe, expect, it } from "bun:test";
import type { WebRouteRole } from "@brains/contracts";
import {
  deriveConsoleSurfaces,
  findRouteByRole,
  type RegisteredWebRoute,
} from "../src";

/** A registered route; only routes that claim a role can be a door. */
const route = (
  pluginId: string,
  fullPath: string,
  role?: WebRouteRole,
): RegisteredWebRoute => ({
  pluginId,
  fullPath,
  definition: {
    path: fullPath,
    handler: (): Response => new Response(null),
    ...(role ? { role } : {}),
  },
});

describe("deriveConsoleSurfaces", () => {
  it("derives each surface's door from the route that claims its role", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("dashboard", "/dashboard", "dashboard"),
        route("studio", "/studio", "studio"),
      ],
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

  it("takes a surface's door from whichever plugin claims its role", () => {
    const studio = deriveConsoleSurfaces(
      [route("operator-console", "/console", "studio")],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    ).find((surface) => surface.id === "studio");

    expect(studio?.href).toBe("/console");
  });

  it("leaves Studio's chat route out of Chat's door unless it claims the role", () => {
    const chat = deriveConsoleSurfaces(
      [
        route("web-chat", "/ask", "ask"),
        route("web-chat", "/api/chat", "chat-api"),
        route("studio", "/chat"),
      ],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    ).find((surface) => surface.id === "web-chat");

    expect(chat?.href).toBe("/ask");
  });

  it("shows no Chat door without a chat backend", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("studio", "/chat", "studio-chat"),
        route("studio", "/studio", "studio"),
      ],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    );

    expect(surfaces.map((surface) => surface.id)).toEqual(["studio"]);
  });

  it("never offers a route that claims no role as a door", () => {
    const studio = deriveConsoleSurfaces(
      [
        route("studio", "/cms"),
        route("studio", "/admin"),
        route("studio", "/account"),
        route("studio", "/studio", "studio"),
      ],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    ).find((surface) => surface.id === "studio");

    expect(studio?.href).toBe("/studio");
  });

  const allSurfaceRoutes = [
    route("dashboard", "/dashboard", "dashboard"),
    route("web-chat", "/ask", "ask"),
    route("web-chat", "/api/chat", "chat-api"),
    route("studio", "/chat", "studio-chat"),
    route("studio", "/studio", "studio"),
    route("studio", "/studio/api/types"),
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
    ]);
  });

  it("falls back to the Ask page as Chat's door without Studio's chat", () => {
    const chat = deriveConsoleSurfaces(
      [
        route("web-chat", "/ask", "ask"),
        route("web-chat", "/api/chat", "chat-api"),
      ],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    ).find((surface) => surface.id === "web-chat");

    expect(chat?.href).toBe("/ask");
  });

  it("shows the same consolidated strip to Trusted and Admin callers", () => {
    const surfaces = deriveConsoleSurfaces(allSurfaceRoutes, {
      activeId: "dashboard",
      permissionLevel: "trusted",
      hasActiveSession: true,
    });

    // Account and administration live inside Studio, so there are no extra
    // console doors at either permission level.
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
        route("dashboard", "/dashboard", "dashboard"),
        route("studio", "/studio", "studio"),
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
      activeId: "web-chat",
      permissionLevel: "public",
      self: { id: "web-chat", href: "/ask" },
    });

    // A caller on their own surface always keeps its door; nothing else leaks.
    expect(surfaces.map((s) => s.id)).toEqual(["dashboard", "web-chat"]);
  });

  it("marks the rendering surface active from any surface", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("dashboard", "/dashboard", "dashboard"),
        route("web-chat", "/ask", "ask"),
        route("web-chat", "/api/chat", "chat-api"),
      ],
      {
        activeId: "web-chat",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    );

    expect(surfaces.find((s) => s.id === "web-chat")?.isActive).toBe(true);
    expect(surfaces.find((s) => s.id === "dashboard")?.isActive).toBe(false);
  });

  it("omits surfaces no route claims", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("dashboard", "/dashboard", "dashboard"),
        route("web-chat", "/ask", "ask"),
        route("web-chat", "/api/chat", "chat-api"),
      ],
      {
        activeId: "dashboard",
        permissionLevel: "admin",
        hasActiveSession: true,
      },
    );

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard", "web-chat"]);
  });

  it("uses the shortest path among routes claiming the same role", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("studio", "/studio/home", "studio"),
        route("studio", "/studio", "studio"),
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
      [route("dashboard", "/dashboard/deep/route", "dashboard")],
      {
        activeId: "dashboard",
        self: { id: "dashboard", href: "/custom-dashboard" },
      },
    );

    expect(surfaces.find((s) => s.id === "dashboard")?.href).toBe(
      "/custom-dashboard",
    );
  });

  it("ignores routes that claim no surface role", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("dashboard", "/dashboard", "dashboard"),
        route("site-builder", "/"),
        route("web-chat", "/api/chat", "chat-api"),
      ],
      { activeId: "dashboard" },
    );

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard"]);
  });
});

describe("findRouteByRole", () => {
  it("finds the shortest route claiming a role, from any plugin", () => {
    expect(
      findRouteByRole(
        [
          route("studio", "/studio/home", "studio"),
          route("operator-console", "/studio", "studio"),
          route("studio", "/s"),
        ],
        "studio",
      )?.fullPath,
    ).toBe("/studio");
  });

  it("finds nothing for a role no route claims", () => {
    expect(
      findRouteByRole([route("studio", "/studio", "studio")], "ask"),
    ).toBeUndefined();
  });
});
