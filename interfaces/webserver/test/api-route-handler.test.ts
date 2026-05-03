import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import type { RegisteredApiRoute, IMessageBus } from "@brains/plugins";
import { createApiRouteHandler } from "../src/api-server";
import { createSilentLogger } from "@brains/test-utils";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { ApiServer } from "../src/api-server";

describe("createApiRouteHandler", () => {
  let mockMessageBus: IMessageBus;
  let app: Hono;

  beforeEach(() => {
    // Message bus wraps tool result in { success, data }
    // Tool result is { success, data, message? }
    mockMessageBus = createMockMessageBus({
      returns: {
        send: {
          success: true,
          data: { success: true, data: { subscribed: true } },
        },
      },
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

      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: "plugin:newsletter:tool:execute",
        payload: expect.objectContaining({
          args: { email: "test@example.com" },
        }),
        sender: "webserver",
      });
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

      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: "plugin:newsletter:tool:execute",
        payload: expect.objectContaining({
          args: { email: "test@example.com" },
        }),
        sender: "webserver",
      });
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

      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: "plugin:newsletter:tool:execute",
        payload: expect.objectContaining({
          toolName: "newsletter_subscribe",
          interfaceType: "webserver",
          userId: "anonymous",
        }),
        sender: "webserver",
      });
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
      const errorMockBus = createMockMessageBus({
        returns: {
          send: {
            success: true,
            data: { success: false, error: "Invalid email" },
          },
        },
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

describe("ApiServer", () => {
  let mockMessageBus: IMessageBus;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus({
      returns: {
        send: {
          success: true,
          data: { success: true, data: { subscribed: true } },
        },
      },
    }) as unknown as IMessageBus;
  });

  it("should skip starting when no routes are registered", async () => {
    const server = new ApiServer({
      logger: createSilentLogger("test-api"),
      port: 0,
      routes: [],
      messageBus: mockMessageBus,
    });

    const url = await server.start();
    expect(url).toBe("");
  });
});
