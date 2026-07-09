import { describe, expect, it } from "bun:test";
import type { RegisteredWebRoute } from "@brains/plugins";
import { deriveConsoleSurfaces } from "../src/render/console-surfaces";

function route(pluginId: string, fullPath: string): RegisteredWebRoute {
  return {
    pluginId,
    fullPath,
    definition: {
      path: fullPath,
      method: "GET",
      handler: () => Promise.resolve(new Response("ok")),
    },
  };
}

describe("deriveConsoleSurfaces", () => {
  it("derives one link per registered operator surface", () => {
    const surfaces = deriveConsoleSurfaces(
      [
        route("dashboard", "/dashboard"),
        route("web-chat", "/chat"),
        route("web-chat", "/chat/api/messages"),
        route("cms", "/cms"),
        route("cms", "/cms/api/types"),
      ],
      "/dashboard",
    );

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
      { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
      { id: "cms", label: "CMS", href: "/cms", isActive: false },
    ]);
  });

  it("omits surfaces whose plugin registered no routes", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("web-chat", "/chat")],
      "/dashboard",
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
      "/dashboard",
    );

    expect(surfaces.find((s) => s.id === "cms")?.href).toBe("/cms");
  });

  it("keeps the dashboard door even without a registered route", () => {
    // The dashboard renders its own page; its entry never depends on
    // reading its own registration back.
    const surfaces = deriveConsoleSurfaces([], "/dashboard");

    expect(surfaces).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
    ]);
  });

  it("ignores routes from non-surface plugins", () => {
    const surfaces = deriveConsoleSurfaces(
      [route("dashboard", "/dashboard"), route("site-builder", "/")],
      "/dashboard",
    );

    expect(surfaces.map((s) => s.id)).toEqual(["dashboard"]);
  });
});
