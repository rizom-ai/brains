import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import type { RegisteredApiRoute, IMessageBus } from "@brains/plugins";
import { ServerManager, createApiRouteHandler } from "../src/server-manager";
import { createSilentLogger, createMockMessageBus } from "@brains/test-utils";

describe("createApiRouteHandler", () => {
  let mockMessageBus: IMessageBus;
  let app: Hono;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus({
      returns: { send: { success: true, data: { subscribed: true } } },
    }) as unknown as IMessageBus;
    app = new Hono();
  });

  const createMockRoute = (
    overrides: Partial<RegisteredApiRoute["definition"]> = {},
  ): RegisteredApiRoute => ({
    pluginId: "newsletter",
    fullPath: "/api/newsletter/subscribe",
    definition: {
      path: "/subscribe",
      method: "POST",
      tool: "subscribe",
      public: true,
      ...overrides,
    },
  });

  describe("request parsing", () => {
    it("should parse JSON body when content-type is application/json", async () => {
      const route = createMockRoute();
      app.post(route.fullPath, createApiRouteHandler(route, mockMessageBus));

      await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "plugin:newsletter:tool:execute",
        expect.objectContaining({
          args: { email: "test@example.com" },
        }),
        "webserver",
      );
    });

    it("should parse form data when content-type is form-urlencoded", async () => {
      const route = createMockRoute();
      app.post(route.fullPath, createApiRouteHandler(route, mockMessageBus));

      const formData = new URLSearchParams();
      formData.append("email", "test@example.com");

      await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: formData.toString(),
      });

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "plugin:newsletter:tool:execute",
        expect.objectContaining({
          args: { email: "test@example.com" },
        }),
        "webserver",
      );
    });
  });

  describe("tool invocation", () => {
    it("should call tool with correct message type", async () => {
      const route = createMockRoute();
      app.post(route.fullPath, createApiRouteHandler(route, mockMessageBus));

      await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "plugin:newsletter:tool:execute",
        expect.objectContaining({
          toolName: "newsletter_subscribe",
          interfaceType: "webserver",
          userId: "anonymous",
        }),
        "webserver",
      );
    });
  });

  describe("response handling", () => {
    it("should return JSON when Accept header includes application/json", async () => {
      const route = createMockRoute({ successRedirect: "/thanks" });
      app.post(route.fullPath, createApiRouteHandler(route, mockMessageBus));

      const response = await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        success: true,
        data: { subscribed: true },
      });
    });

    it("should redirect to successRedirect on success for form submissions", async () => {
      const route = createMockRoute({ successRedirect: "/subscribe/thanks" });
      app.post(route.fullPath, createApiRouteHandler(route, mockMessageBus));

      const response = await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "email=test@example.com",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/subscribe/thanks");
    });

    it("should redirect to errorRedirect on failure for form submissions", async () => {
      // Create a fresh mock bus with error response
      const errorMockBus = createMockMessageBus({
        returns: { send: { success: false, error: "Invalid email" } },
      }) as unknown as IMessageBus;

      const route = createMockRoute({
        successRedirect: "/subscribe/thanks",
        errorRedirect: "/subscribe/error",
      });
      app.post(route.fullPath, createApiRouteHandler(route, errorMockBus));

      const response = await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "email=invalid",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/subscribe/error");
    });
  });
});

describe("ServerManager.mountApiRoutes", () => {
  let serverManager: ServerManager;
  let mockMessageBus: IMessageBus;

  beforeEach(() => {
    serverManager = new ServerManager({
      logger: createSilentLogger("test-server"),
      productionDistDir: "/tmp/test-dist",
      productionPort: 9999,
    });

    mockMessageBus = createMockMessageBus({
      returns: { send: { success: true, data: { subscribed: true } } },
    }) as unknown as IMessageBus;
  });

  it("should mount POST routes on the app", () => {
    const app = new Hono();
    const routes: RegisteredApiRoute[] = [
      {
        pluginId: "newsletter",
        fullPath: "/api/newsletter/subscribe",
        definition: {
          path: "/subscribe",
          method: "POST",
          tool: "subscribe",
          public: true,
        },
      },
    ];

    serverManager.mountApiRoutes(app, routes, mockMessageBus);

    // Verify route was mounted by checking app has the route
    expect(app.routes.length).toBeGreaterThan(0);
  });

  it("should mount GET routes on the app", () => {
    const app = new Hono();
    const routes: RegisteredApiRoute[] = [
      {
        pluginId: "newsletter",
        fullPath: "/api/newsletter/status",
        definition: {
          path: "/status",
          method: "GET",
          tool: "get_status",
          public: true,
        },
      },
    ];

    serverManager.mountApiRoutes(app, routes, mockMessageBus);

    expect(app.routes.length).toBeGreaterThan(0);
  });

  it("should mount multiple routes", () => {
    const app = new Hono();
    const routes: RegisteredApiRoute[] = [
      {
        pluginId: "newsletter",
        fullPath: "/api/newsletter/subscribe",
        definition: {
          path: "/subscribe",
          method: "POST",
          tool: "subscribe",
          public: true,
        },
      },
      {
        pluginId: "newsletter",
        fullPath: "/api/newsletter/unsubscribe",
        definition: {
          path: "/unsubscribe",
          method: "POST",
          tool: "unsubscribe",
          public: true,
        },
      },
    ];

    serverManager.mountApiRoutes(app, routes, mockMessageBus);

    expect(app.routes.length).toBeGreaterThanOrEqual(2);
  });

  it("should handle requests to mounted routes", async () => {
    const app = new Hono();
    const routes: RegisteredApiRoute[] = [
      {
        pluginId: "newsletter",
        fullPath: "/api/newsletter/subscribe",
        definition: {
          path: "/subscribe",
          method: "POST",
          tool: "subscribe",
          public: true,
        },
      },
    ];

    serverManager.mountApiRoutes(app, routes, mockMessageBus);

    const response = await app.request("/api/newsletter/subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ success: true, data: { subscribed: true } });
  });
});
