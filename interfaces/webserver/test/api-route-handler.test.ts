import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { RegisteredApiRoute } from "@brains/plugins";
import { createApiRouteHandler } from "../src/api-server";

type ToolExecutor = (
  route: RegisteredApiRoute,
  args: Record<string, unknown>,
) => Promise<unknown>;

/** A tool executor answering every call with the given bus reply. */
function executorReplying(
  reply: unknown,
): ReturnType<typeof mock<ToolExecutor>> {
  return mock<ToolExecutor>(() => Promise.resolve(reply));
}

describe("webserver exports", () => {
  it("does not export a standalone API server", async () => {
    const exports = await import("../src");
    expect(Object.keys(exports)).not.toContain("ApiServer");
  });
});

describe("createApiRouteHandler", () => {
  let executeTool: ReturnType<typeof executorReplying>;
  let app: Hono;

  beforeEach(() => {
    // The owning plugin's bus reply wraps the tool result: { success, data }.
    executeTool = executorReplying({
      success: true,
      data: { success: true, data: { subscribed: true } },
    });
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
      app.post(route.fullPath, createApiRouteHandler(route, executeTool));

      await app.request(route.fullPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(executeTool).toHaveBeenCalledWith(route, {
        email: "test@example.com",
      });
    });

    it("should parse form data when content-type is form-urlencoded", async () => {
      const route = createMockRoute();
      app.post(route.fullPath, createApiRouteHandler(route, executeTool));

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

      expect(executeTool).toHaveBeenCalledWith(route, {
        email: "test@example.com",
      });
    });
  });

  describe("response handling", () => {
    it("should return JSON when Accept header includes application/json", async () => {
      const route = createMockRoute({ successRedirect: "/thanks" });
      app.post(route.fullPath, createApiRouteHandler(route, executeTool));

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
      app.post(route.fullPath, createApiRouteHandler(route, executeTool));

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
      const failingTool = executorReplying({
        success: true,
        data: { success: false, error: "Invalid email" },
      });

      const route = createMockRoute({
        successRedirect: "/subscribe/thanks",
        errorRedirect: "/subscribe/error",
      });
      app.post(route.fullPath, createApiRouteHandler(route, failingTool));

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
