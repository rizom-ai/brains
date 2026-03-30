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
    const result = (await tool.handler(
      {},
      {
        interfaceType: "test",
        userId: "test",
      },
    )) as { success: boolean; data: unknown };

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("model", "test");
    expect(result.data).toHaveProperty("version", "1.0.0");
  });

  it("should be publicly visible", () => {
    const tool = findTool("system_status");
    expect(tool.visibility).toBe("public");
  });
});
