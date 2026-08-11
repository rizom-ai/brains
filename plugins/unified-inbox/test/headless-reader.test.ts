import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCPService } from "@brains/mcp-service";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";

import { UnifiedInboxPlugin } from "../src";

const textToolResponseSchema = z.object({
  content: z
    .array(z.object({ type: z.literal("text"), text: z.string() }))
    .min(1),
});

describe("unified inbox headless reader", () => {
  it("answers over the MCP protocol without browser plugins or sources", async () => {
    const harness = createPluginHarness<UnifiedInboxPlugin>({
      logContext: "unified-inbox-headless-test",
    });
    const plugin = new UnifiedInboxPlugin();
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready();

    const shell = harness.getMockShell();
    expect(shell.hasPlugin("webserver")).toBe(false);
    expect(shell.hasPlugin("cms")).toBe(false);
    expect(shell.hasPlugin("dashboard")).toBe(false);

    const mcpService = MCPService.createFresh(
      shell.getMessageBus(),
      shell.getLogger(),
    );
    mcpService.setProtocolMode("basic");
    for (const tool of capabilities.tools) {
      mcpService.registerTool(plugin.id, tool);
    }

    const client = new Client({
      name: "unified-inbox-headless-test",
      version: "1.0.0",
    });
    const mcpServer = mcpService.createMcpServer("admin");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("inbox_list");

      const response = textToolResponseSchema.parse(
        await client.callTool({
          name: "inbox_list",
          arguments: {},
        }),
      );
      const content = response.content[0];
      if (content?.type !== "text") {
        throw new Error("Expected inbox_list text response");
      }
      expect(JSON.parse(content.text)).toEqual({
        success: true,
        data: { entries: [], errors: [], total: 0 },
      });
    } finally {
      await client.close();
      await mcpServer.close();
    }
  });
});
