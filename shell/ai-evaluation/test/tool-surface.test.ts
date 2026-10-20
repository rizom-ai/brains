import { describe, expect, it } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";

import {
  createToolSurfaceReport,
  renderToolSurfaceReport,
  type ToolSurfaceReportInput,
} from "../src/tool-surface";

function tool(name: string, description = "A tool"): Tool {
  return {
    name,
    description,
    inputSchema: { query: z.string() },
    handler: async () => ({ success: true, data: {} }),
  };
}

const noInstructions = { public: "", trusted: "", admin: "" };

const emptySurfaces: ToolSurfaceReportInput = {
  internalTools: [],
  agentTools: { public: [], trusted: [], admin: [] },
  protocolTools: {
    basic: { public: [], trusted: [], admin: [] },
    debug: { public: [], trusted: [], admin: [] },
  },
  cliTools: [],
  agentInstructions: noInstructions,
};

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
      agentInstructions: noInstructions,
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
      agentInstructions: noInstructions,
    });

    const markdown = renderToolSurfaceReport(report);

    expect(markdown).toContain("# Tool Surface Report");
    expect(markdown).toContain("Internal registry: 1");
    expect(markdown).toContain("Agent tools (Admin): 0");
    expect(markdown).toContain("MCP basic tools (Public): 0");
  });

  it("sizes each level's initial prompt from its instructions and agent tools", () => {
    const search = tool("system_search", "Search");
    const create = tool("system_create", "Créer");
    const report = createToolSurfaceReport({
      ...emptySurfaces,
      agentTools: {
        public: [{ pluginId: "system", tool: search }],
        trusted: [{ pluginId: "system", tool: search }],
        admin: [
          { pluginId: "system", tool: search },
          { pluginId: "system", tool: create },
        ],
      },
      agentInstructions: {
        public: "public",
        trusted: "trusted",
        admin: "admin é",
      },
    });

    const schemaBytes = report.agentTools.public[0]?.schemaBytes ?? 0;
    expect(schemaBytes).toBeGreaterThan(0);
    expect(report.agentPrompt.public).toEqual({
      instructionsBytes: 6,
      descriptionBytes: 6,
      schemaBytes,
      initialPromptBytes: 6 + 6 + schemaBytes,
    });
    expect(report.agentPrompt.admin).toEqual({
      instructionsBytes: 8,
      descriptionBytes: 6 + 6,
      schemaBytes: schemaBytes * 2,
      initialPromptBytes: 8 + 12 + schemaBytes * 2,
    });
  });

  it("renders each level's prompt size in the summary", () => {
    const report = createToolSurfaceReport({
      ...emptySurfaces,
      agentTools: {
        public: [],
        trusted: [],
        admin: [{ pluginId: "system", tool: tool("system_search", "Search") }],
      },
      agentInstructions: { public: "p", trusted: "tt", admin: "aaa" },
    });
    const schemaBytes = report.agentTools.admin[0]?.schemaBytes ?? 0;

    const markdown = renderToolSurfaceReport(report);

    expect(markdown).toContain(
      "Agent prompt (Public): instructions 1 bytes, tool descriptions 0 bytes, tool schemas 0 bytes, initial prompt 1 bytes",
    );
    expect(markdown).toContain(
      `Agent prompt (Admin): instructions 3 bytes, tool descriptions 6 bytes, tool schemas ${schemaBytes} bytes, initial prompt ${3 + 6 + schemaBytes} bytes`,
    );
  });
});
