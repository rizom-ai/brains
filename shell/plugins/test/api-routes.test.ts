import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withApiRoutes,
} from "../src";
import type { Plugin } from "../src/interfaces";
import {
  apiRouteDefinitionSchema,
  type ApiRouteDefinition,
} from "../src/types/api-routes";

describe("API Route Definition Schema", () => {
  it("should validate a minimal route definition", () => {
    const route = {
      path: "/subscribe",
      tool: "subscribe",
    };

    const result = apiRouteDefinitionSchema.parse(route);

    expect(result.path).toBe("/subscribe");
    expect(result.tool).toBe("subscribe");
    expect(result.method).toBe("POST"); // default
    expect(result.public).toBe(false); // default
  });

  it("should validate a full route definition", () => {
    const route = {
      path: "/subscribe",
      method: "POST" as const,
      tool: "subscribe",
      public: true,
      successRedirect: "/subscribe/thanks",
      errorRedirect: "/subscribe/error",
    };

    const result = apiRouteDefinitionSchema.parse(route);

    expect(result.path).toBe("/subscribe");
    expect(result.method).toBe("POST");
    expect(result.tool).toBe("subscribe");
    expect(result.public).toBe(true);
    expect(result.successRedirect).toBe("/subscribe/thanks");
    expect(result.errorRedirect).toBe("/subscribe/error");
  });

  it("should reject invalid method", () => {
    const route = {
      path: "/test",
      method: "PATCH", // not in enum
      tool: "test",
    };

    expect(() => apiRouteDefinitionSchema.parse(route)).toThrow();
  });

  it("should require path", () => {
    const route = {
      tool: "test",
    };

    expect(() => apiRouteDefinitionSchema.parse(route)).toThrow();
  });

  it("should require tool", () => {
    const route = {
      path: "/test",
    };

    expect(() => apiRouteDefinitionSchema.parse(route)).toThrow();
  });
});

/** A declared service, with the API routes it declares, if any. */
function service(routes?: readonly ApiRouteDefinition[]): Plugin {
  const definition = defineServicePlugin({
    id: "test-plugin",
    config: z.object({}),
    setup: () => ({}),
  });
  const [plugin] = instantiatePluginPackageDefinition(
    routes ? withApiRoutes(definition, () => routes) : definition,
    {},
    { name: "@fixture/test-plugin", version: "1.0.0" },
  );
  if (!plugin) throw new Error("No service");
  return plugin;
}

const withRoutes = (): Plugin =>
  service([
    {
      path: "/subscribe",
      method: "POST",
      tool: "subscribe",
      public: true,
      successRedirect: "/thanks",
    },
    {
      path: "/unsubscribe",
      method: "POST",
      tool: "unsubscribe",
      public: true,
    },
  ]);

describe("a declared service's API routes", () => {
  it("should return declared API routes", () => {
    const routes = withRoutes().getApiRoutes?.() ?? [];

    expect(routes).toHaveLength(2);
    expect(routes[0]?.path).toBe("/subscribe");
    expect(routes[0]?.tool).toBe("subscribe");
    expect(routes[1]?.path).toBe("/unsubscribe");
  });

  it("should return empty array when no routes declared", () => {
    const routes = service().getApiRoutes?.() ?? [];

    expect(routes).toHaveLength(0);
  });

  it("should return routes with correct structure", () => {
    const routes = withRoutes().getApiRoutes?.() ?? [];
    const subscribeRoute = routes[0];

    expect(subscribeRoute).toMatchObject({
      path: "/subscribe",
      method: "POST",
      tool: "subscribe",
      public: true,
      successRedirect: "/thanks",
    });
  });
});
