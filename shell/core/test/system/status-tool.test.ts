import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { z } from "@brains/utils/zod";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";

const toolContext = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test" },
};

describe("system_status tool", () => {
  let tools: Tool[];

  beforeEach(() => {
    const services = createMockSystemServices();
    tools = createSystemTools(services);
  });

  function findTool(name: string): Tool {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  it("should exist in system tools", () => {
    expect(tools.some((t) => t.name === "system_status")).toBe(true);
  });

  it("should return app info on success", async () => {
    const tool = findTool("system_status");
    const result = await tool.handler({}, toolContext);

    expect("success" in result && result.success).toBe(true);
    if (!("success" in result) || !result.success) return;

    const data = z.record(z.string(), z.unknown()).parse(result.data);
    expect(data["model"]).toBe("test");
    expect(data["version"]).toBe("1.0.0");
    expect(typeof data["uptime"]).toBe("number");
    expect(data["entities"]).toBeDefined();
    expect(data["backgroundWork"]).toEqual(
      expect.objectContaining({
        status: "operational",
        worker: expect.objectContaining({ state: "active" }),
        queue: expect.objectContaining({ duePending: 0 }),
      }),
    );
    expect(data["ai"]).toBeDefined();
  });

  it("returns a compact public payload", async () => {
    const tool = findTool("system_status");
    const result = await tool.handler(
      {},
      { ...toolContext, userPermissionLevel: "public" },
    );

    expect("success" in result && result.success).toBe(true);
    if (!("success" in result) || !result.success) return;

    const data = z.record(z.string(), z.unknown()).parse(result.data);
    expect(data["entityCounts"]).toBeUndefined();
    expect(data["daemons"]).toBeUndefined();
    expect(data["interactions"]).toBeUndefined();
  });

  it.each([
    ["public", ["Site", "Dashboard", "Studio"]],
    ["trusted", ["Site", "Chat", "Dashboard", "MCP", "Studio"]],
    ["admin", ["Site", "Chat", "Preview", "Dashboard", "MCP", "Studio"]],
  ] as const)(
    "lists the web surfaces a %s caller can open, by priority",
    async (userPermissionLevel, labels) => {
      const services = createMockSystemServices();
      const appInfo = await services.getAppInfo();
      const endpoint = (
        label: string,
        url: string,
        priority: number,
        visibility: "public" | "trusted" | "admin",
      ): (typeof appInfo.endpoints)[number] => ({
        label,
        url,
        priority,
        visibility,
        pluginId: "test",
      });
      services.getAppInfo = async (): Promise<typeof appInfo> => ({
        ...appInfo,
        endpoints: [
          endpoint("Studio", "/studio", 40, "public"),
          endpoint("Preview", "https://preview.example", 20, "admin"),
          endpoint("Dashboard", "/dashboard", 30, "public"),
          endpoint("MCP", "/mcp", 30, "trusted"),
          endpoint("Chat", "/studio/chat", 15, "trusted"),
          endpoint("Site", "https://example", 10, "public"),
        ],
      });
      const tool = createSystemTools(services).find(
        (t) => t.name === "system_status",
      );
      const result = await tool?.handler(
        {},
        { ...toolContext, userPermissionLevel },
      );

      expect(result).toMatchObject({ success: true });
      const data = z
        .object({
          endpoints: z.array(z.object({ label: z.string(), url: z.string() })),
        })
        .parse(result && "data" in result ? result.data : undefined);
      expect(data.endpoints.map((e) => e.label)).toEqual([...labels]);
      expect(data.endpoints).toContainEqual({
        label: "Dashboard",
        url: "/dashboard",
      });
      expect(Object.keys(data.endpoints[0] ?? {})).toEqual(["label", "url"]);
    },
  );

  it("should not include plugin or tool lists", async () => {
    const tool = findTool("system_status");
    const result = await tool.handler({}, toolContext);

    expect("success" in result && result.success).toBe(true);
    if (!("success" in result) || !result.success) return;

    const data = z.record(z.string(), z.unknown()).parse(result.data);
    expect(data["plugins"]).toBeUndefined();
    expect(data["tools"]).toBeUndefined();
    expect(data["interfaces"]).toBeUndefined();
  });

  it("should be publicly visible", () => {
    const tool = findTool("system_status");
    expect(tool.visibility).toBe("public");
  });

  it("declares read-only side effects", () => {
    const tool = findTool("system_status");
    expect(tool.sideEffects).toBe("none");
  });
});
