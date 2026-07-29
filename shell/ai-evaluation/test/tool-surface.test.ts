import { describe, expect, it } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";

import {
  createToolSurfaceReport,
  renderToolSurfaceReport,
} from "../src/tool-surface";

function tool(name: string, description = "A tool"): Tool {
  return {
    name,
    description,
    inputSchema: { query: z.string() },
    handler: async () => ({ success: true, data: {} }),
  };
}

describe("tool surface report", () => {
  it("keeps internal, agent, protocol, and CLI surfaces distinct", () => {
    const report = createToolSurfaceReport({
      internalTools: [
        { pluginId: "system", tool: tool("system_search") },
        { pluginId: "mcp", tool: tool("chat") },
      ],
      agentTools: {
        public: [{ pluginId: "system", tool: tool("system_search") }],
        trusted: [{ pluginId: "system", tool: tool("system_search") }],
        admin: [{ pluginId: "system", tool: tool("system_search") }],
      },
      protocolTools: {
        basic: {
          public: [{ pluginId: "mcp", tool: tool("chat") }],
          trusted: [{ pluginId: "mcp", tool: tool("chat") }],
          admin: [{ pluginId: "mcp", tool: tool("chat") }],
        },
        debug: {
          public: [{ pluginId: "mcp", tool: tool("chat") }],
          trusted: [{ pluginId: "mcp", tool: tool("chat") }],
          admin: [
            { pluginId: "system", tool: tool("system_search") },
            { pluginId: "mcp", tool: tool("chat") },
          ],
        },
      },
      cliTools: [{ pluginId: "system", tool: tool("system_search") }],
    });

    expect(report.internalTools.map((entry) => entry.name)).toEqual([
      "chat",
      "system_search",
    ]);
    expect(report.agentTools.admin.map((entry) => entry.name)).toEqual([
      "system_search",
    ]);
    expect(report.protocolTools.debug.admin.map((entry) => entry.name)).toEqual(
      ["chat", "system_search"],
    );
    expect(report.cliTools.map((entry) => entry.name)).toEqual([
      "system_search",
    ]);
    expect(report.internalTools[0]?.descriptionBytes).toBeGreaterThan(0);
    expect(report.internalTools[0]?.schemaBytes).toBeGreaterThan(0);
  });

  it("renders counts for each surface", () => {
    const report = createToolSurfaceReport({
      internalTools: [{ pluginId: "system", tool: tool("system_search") }],
      agentTools: { public: [], trusted: [], admin: [] },
      protocolTools: {
        basic: { public: [], trusted: [], admin: [] },
        debug: { public: [], trusted: [], admin: [] },
      },
      cliTools: [],
    });

    const markdown = renderToolSurfaceReport(report);

    expect(markdown).toContain("# Tool Surface Report");
    expect(markdown).toContain("Internal registry: 1");
    expect(markdown).toContain("Agent tools (Admin): 0");
    expect(markdown).toContain("MCP basic tools (Public): 0");
  });
});
