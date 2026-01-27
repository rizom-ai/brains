import { describe, it, expect, beforeEach } from "bun:test";
import { MockShell } from "@brains/plugins/test";
import { ServicePlugin, type ApiRouteDefinition } from "@brains/plugins";
import { z } from "@brains/utils";

// Test plugin with API routes
class PluginWithRoutes extends ServicePlugin {
  constructor() {
    super(
      "plugin-with-routes",
      { name: "plugin-with-routes", version: "1.0.0" },
      {},
      z.object({}),
    );
  }

  override getApiRoutes(): ApiRouteDefinition[] {
    return [
      {
        path: "/subscribe",
        method: "POST",
        tool: "subscribe",
        public: true,
        successRedirect: "/thanks",
      },
    ];
  }
}

// Test plugin without API routes
class PluginWithoutRoutes extends ServicePlugin {
  constructor() {
    super(
      "plugin-without-routes",
      { name: "plugin-without-routes", version: "1.0.0" },
      {},
      z.object({}),
    );
  }
}

describe("Shell.getPluginApiRoutes()", () => {
  let mockShell: MockShell;

  beforeEach(() => {
    mockShell = MockShell.createFresh();
  });

  it("should return empty array when no plugins have API routes", () => {
    mockShell.registerPlugin(new PluginWithoutRoutes());

    const routes = mockShell.getPluginApiRoutes();

    expect(routes).toHaveLength(0);
  });

  it("should return routes from plugins that have them", () => {
    mockShell.registerPlugin(new PluginWithRoutes());

    const routes = mockShell.getPluginApiRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      pluginId: "plugin-with-routes",
      fullPath: "/api/plugin-with-routes/subscribe",
      definition: {
        path: "/subscribe",
        method: "POST",
        tool: "subscribe",
        public: true,
      },
    });
  });

  it("should collect routes from multiple plugins", () => {
    mockShell.registerPlugin(new PluginWithRoutes());
    mockShell.registerPlugin(new PluginWithoutRoutes());

    const routes = mockShell.getPluginApiRoutes();

    // Should only have routes from PluginWithRoutes
    expect(routes).toHaveLength(1);
    expect(routes[0]?.pluginId).toBe("plugin-with-routes");
  });

  it("should construct fullPath as /api/{pluginId}{path}", () => {
    mockShell.registerPlugin(new PluginWithRoutes());

    const routes = mockShell.getPluginApiRoutes();

    expect(routes[0]?.fullPath).toBe("/api/plugin-with-routes/subscribe");
  });
});
