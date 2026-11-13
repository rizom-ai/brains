import { describe, it, expect, beforeEach } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withApiRoutes,
  type ApiRouteDefinition,
  type Plugin,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

/** A declared service, under its own plugin id, with or without API routes. */
function service(id: string, routes?: readonly ApiRouteDefinition[]): Plugin {
  const definition = defineServicePlugin({
    id,
    config: z.object({}),
    setup: () => ({}),
  });
  const [plugin] = instantiatePluginPackageDefinition(
    routes ? withApiRoutes(definition, () => routes) : definition,
    {},
    { name: id, version: "1.0.0" },
    { pluginId: id },
  );
  if (!plugin) throw new Error(`No plugin ${id}`);
  return plugin;
}

const pluginWithRoutes = (): Plugin =>
  service("plugin-with-routes", [
    {
      path: "/subscribe",
      method: "POST",
      tool: "subscribe",
      public: true,
      successRedirect: "/thanks",
    },
  ]);
const pluginWithoutRoutes = (): Plugin => service("plugin-without-routes");

describe("Shell.getPluginApiRoutes()", () => {
  let mockShell: MockShell;

  beforeEach(() => {
    mockShell = createMockShell();
  });

  it("should return empty array when no plugins have API routes", () => {
    mockShell.registerPlugin(pluginWithoutRoutes());

    const routes = mockShell.getPluginApiRoutes();

    expect(routes).toHaveLength(0);
  });

  it("should return routes from plugins that have them", () => {
    mockShell.registerPlugin(pluginWithRoutes());

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
    mockShell.registerPlugin(pluginWithRoutes());
    mockShell.registerPlugin(pluginWithoutRoutes());

    const routes = mockShell.getPluginApiRoutes();

    // Should only have routes from pluginWithRoutes
    expect(routes).toHaveLength(1);
    expect(routes[0]?.pluginId).toBe("plugin-with-routes");
  });

  it("should construct fullPath as /api/{pluginId}{path}", () => {
    mockShell.registerPlugin(pluginWithRoutes());

    const routes = mockShell.getPluginApiRoutes();

    expect(routes[0]?.fullPath).toBe("/api/plugin-with-routes/subscribe");
  });
});
