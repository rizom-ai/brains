import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import { ServicePlugin } from "../src/service/service-plugin";
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

// Test plugin class with API routes
class TestPluginWithRoutes extends ServicePlugin {
  constructor() {
    super(
      "test-plugin",
      { name: "test-plugin", version: "1.0.0" },
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
      {
        path: "/unsubscribe",
        method: "POST",
        tool: "unsubscribe",
        public: true,
      },
    ];
  }
}

// Test plugin class without API routes (uses default empty array)
class TestPluginWithoutRoutes extends ServicePlugin {
  constructor() {
    super(
      "test-plugin-no-routes",
      { name: "test-plugin-no-routes", version: "1.0.0" },
      {},
      z.object({}),
    );
  }
}

describe("ServicePlugin.getApiRoutes()", () => {
  it("should return declared API routes", () => {
    const plugin = new TestPluginWithRoutes();
    const routes = plugin.getApiRoutes();

    expect(routes).toHaveLength(2);
    expect(routes[0]?.path).toBe("/subscribe");
    expect(routes[0]?.tool).toBe("subscribe");
    expect(routes[1]?.path).toBe("/unsubscribe");
  });

  it("should return empty array when no routes declared", () => {
    const plugin = new TestPluginWithoutRoutes();
    const routes = plugin.getApiRoutes();

    expect(routes).toHaveLength(0);
  });

  it("should return routes with correct structure", () => {
    const plugin = new TestPluginWithRoutes();
    const routes = plugin.getApiRoutes();
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
