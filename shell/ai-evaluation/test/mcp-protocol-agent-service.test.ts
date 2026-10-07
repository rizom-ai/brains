import { describe, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/server";
import type { IMCPTransport } from "@brains/mcp-service";
import type { MCPProtocolMode } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { MCPProtocolAgentService } from "../src/mcp-protocol-agent-service";

function toolResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

function createTransport(options: { extraTool?: boolean } = {}): {
  transport: IMCPTransport;
  protocolModes: MCPProtocolMode[];
  permissions: UserPermissionLevel[];
} {
  const protocolModes: MCPProtocolMode[] = [];
  const permissions: UserPermissionLevel[] = [];
  let isAnchor = false;

  const transport: IMCPTransport = {
    getMcpServer: () => createServer(options.extraTool ?? false),
    createMcpServer: (permissionLevel = "admin") => {
      permissions.push(permissionLevel);
      return createServer(options.extraTool ?? false);
    },
    setPermissionLevel: () => undefined,
    setAnchorStatus: (nextIsAnchor) => {
      isAnchor = nextIsAnchor;
    },
    setProtocolMode: (mode) => {
      protocolModes.push(mode);
    },
  };

  function createServer(extraTool: boolean): McpServer {
    const server = new McpServer({ name: "eval-test", version: "1.0.0" });
    server.registerTool(
      "mcp_chat",
      {
        inputSchema: {
          message: z.string(),
          conversationId: z.string(),
        },
      },
      ({ message }) => {
        if (message === "write") {
          return toolResult({
            needsConfirmation: true,
            toolName: "system_create",
            summary: "Save the note?",
            completionSummary: "Saved the note.",
            preview: "MCP Basic Evidence Note",
            args: {
              approvalId: "approval-1",
              toolCallId: "call-1",
              originalArgs: { entityType: "note" },
              conversationId: "conversation-1",
            },
          });
        }
        return toolResult({
          success: true,
          data: {
            text: `${isAnchor ? "anchor" : "member"} response`,
            conversationId: "conversation-1",
            toolResults: [
              {
                toolName: "system_get",
                args: { entityType: "note", id: "seeded-note" },
                data: { id: "seeded-note" },
              },
            ],
          },
        });
      },
    );
    server.registerTool(
      "mcp_confirm",
      {
        inputSchema: {
          approvalId: z.string(),
          confirmed: z.boolean(),
          conversationId: z.string(),
        },
      },
      () =>
        toolResult({
          success: true,
          data: {
            text: "Completed: saved note",
            conversationId: "conversation-1",
            toolResults: [
              {
                toolName: "system_create",
                data: { id: "mcp-basic-evidence" },
              },
            ],
          },
        }),
    );
    if (extraTool) {
      server.registerTool(
        "system_search",
        { inputSchema: { query: z.string() } },
        () => toolResult({ text: "raw read" }),
      );
    }
    return server;
  }

  return { transport, protocolModes, permissions };
}

describe("MCPProtocolAgentService", () => {
  test("routes chat and confirmation through the basic protocol", async () => {
    const { transport, protocolModes, permissions } = createTransport();
    const service = await MCPProtocolAgentService.connect(transport);

    try {
      expect(protocolModes).toEqual(["basic"]);
      expect(permissions).toEqual(["public", "trusted", "admin"]);

      const read = await service.chat("read", "conversation-1", {
        userPermissionLevel: "public",
      });
      expect(read.text).toBe("member response");
      expect(read.toolResults?.[0]).toMatchObject({
        toolName: "system_get",
        args: { entityType: "note", id: "seeded-note" },
      });

      const pending = await service.chat("write", "conversation-1", {
        userPermissionLevel: "admin",
        isAnchor: true,
      });
      expect(pending.pendingConfirmations).toEqual([
        {
          id: "approval-1",
          toolCallId: "call-1",
          toolName: "system_create",
          summary: "Save the note?",
          completionSummary: "Saved the note.",
          preview: "MCP Basic Evidence Note",
          args: { entityType: "note" },
        },
      ]);

      const confirmed = await service.confirmPendingAction(
        "conversation-1",
        true,
        "approval-1",
        { userPermissionLevel: "admin", isAnchor: true },
      );
      expect(confirmed.text).toBe("Completed: saved note");
      expect(confirmed.toolResults?.[0]).toMatchObject({
        toolName: "system_create",
        data: { id: "mcp-basic-evidence" },
      });
    } finally {
      await service.close();
    }
  });

  test("rejects a basic protocol surface containing raw tools", async () => {
    const { transport } = createTransport({ extraTool: true });
    expect(MCPProtocolAgentService.connect(transport)).rejects.toThrow(
      "Basic MCP protocol must expose exactly chat and confirm at public; received: mcp_chat, mcp_confirm, system_search",
    );
  });
});
