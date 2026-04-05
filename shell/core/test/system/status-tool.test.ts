import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";

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
    const result = await tool.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );

    expect("success" in result && result.success).toBe(true);
    if (!("success" in result) || !result.success) return;

    const data = result.data as Record<string, unknown>;
    expect(data["model"]).toBe("test");
    expect(data["version"]).toBe("1.0.0");
    expect(typeof data["uptime"]).toBe("number");
    expect(data["entities"]).toBeDefined();
    expect(data["ai"]).toBeDefined();
  });

  it("should not include plugin or tool lists", async () => {
    const tool = findTool("system_status");
    const result = await tool.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );

    expect("success" in result && result.success).toBe(true);
    if (!("success" in result) || !result.success) return;

    const data = result.data as Record<string, unknown>;
    expect(data["plugins"]).toBeUndefined();
    expect(data["tools"]).toBeUndefined();
    expect(data["interfaces"]).toBeUndefined();
  });

  it("should be publicly visible", () => {
    const tool = findTool("system_status");
    expect(tool.visibility).toBe("public");
  });
});
