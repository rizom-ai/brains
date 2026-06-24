import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";

describe("system_check-job-status tool", () => {
  let tools: Tool[];

  beforeEach(() => {
    const services = createMockSystemServices();
    tools = createSystemTools(services);
  });

  function findTool(name: string): Tool {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  it("tells agents to inspect runtime status for ready checks and status disputes", () => {
    const tool = findTool("system_check-job-status");

    expect(tool.description).toContain("ready checks");
    expect(tool.description).toContain("status disputes");
    expect(tool.description).toContain("runtime job status");
    expect(tool.description).toContain(
      "Do not argue from the transcript alone",
    );
  });
});
