import { describe, expect, test } from "bun:test";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
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
      "chat",
      {
        inputSchema: {
          message: z.string(),
          conversationId: z.string(),
        },
      },
      ({ message }) => {
        if (message === "write" || message === "write with reply") {
          return toolResult({
            needsConfirmation: true,
            toolName: "system_create",
            summary: "Save the note?",
            ...(message === "write with reply"
              ? { text: "Here is the note.\n\nConfirmation required." }
              : {}),
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
      "confirm",
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

/** Answers each request the way a stateless HTTP MCP endpoint does. */
function serveOverHttp(
  transport: IMCPTransport,
  authorizations: Array<string | null> = [],
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const request = new Request(url, init);
    authorizations.push(request.headers.get("authorization"));
    const server = transport.getMcpServer();
    const http = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(http);
    return http.handleRequest(request);
  };
}

describe("MCPProtocolAgentService", () => {
  test("refuses a turn with attachments, which basic MCP chat cannot carry", async () => {
    const { transport } = createTransport();
    const service = await MCPProtocolAgentService.connect(transport);

    try {
      const refused = service.chat("describe that picture", "conversation-1", {
        userPermissionLevel: "admin",
        attachments: [
          {
            kind: "file",
            filename: "robot.png",
            mediaType: "image/png",
            data: new Uint8Array([1, 2, 3]),
          },
        ],
      });
      expect(
        await refused.then(
          () => null,
          (error: unknown) => error,
        ),
      ).toEqual(
        new Error(
          "Basic MCP chat carries no attachments: robot.png cannot reach the brain through it",
        ),
      );
    } finally {
      await service.close();
    }
  });

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
      expect(pending.text).toBe("Save the note?");

      // What the agent wrote is the reply the MCP client sees.
      const withReply = await service.chat(
        "write with reply",
        "conversation-1",
        { userPermissionLevel: "admin", isAnchor: true },
      );
      expect(withReply.text).toBe(
        "Here is the note.\n\nConfirmation required.",
      );

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

  test("routes chat and confirmation to a running brain over HTTP", async () => {
    const { transport } = createTransport();
    const authorizations: Array<string | null> = [];
    const service = await MCPProtocolAgentService.connectRemote({
      url: "http://brain.test",
      token: "dev-token",
      fetch: serveOverHttp(transport, authorizations),
    });

    try {
      const read = await service.chat("read", "conversation-1", {
        userPermissionLevel: "admin",
      });
      expect(read.toolResults?.[0]).toMatchObject({ toolName: "system_get" });
      const confirmed = await service.confirmPendingAction(
        "conversation-1",
        true,
        "approval-1",
        { userPermissionLevel: "admin" },
      );
      expect(confirmed.text).toBe("Completed: saved note");
      expect(authorizations.length).toBeGreaterThan(0);
      expect(new Set(authorizations)).toEqual(new Set(["Bearer dev-token"]));
    } finally {
      await service.close();
    }
  });

  test("refuses a case whose caller the remote token cannot be", async () => {
    const { transport } = createTransport();
    const service = await MCPProtocolAgentService.connectRemote({
      url: "http://brain.test",
      token: "dev-token",
      fetch: serveOverHttp(transport),
    });

    try {
      expect(
        service.chat("read", "conversation-1", {
          userPermissionLevel: "trusted",
        }),
      ).rejects.toThrow(
        "A remote MCP eval runs as the token's caller, a non-Anchor Admin; this case needs a trusted caller",
      );
      expect(
        service.chat("read", "conversation-1", {
          userPermissionLevel: "admin",
          isAnchor: true,
        }),
      ).rejects.toThrow("this case needs an admin Anchor caller");
    } finally {
      await service.close();
    }
  });

  test("rejects a basic protocol surface containing raw tools", async () => {
    const { transport } = createTransport({ extraTool: true });
    expect(MCPProtocolAgentService.connect(transport)).rejects.toThrow(
      "Basic MCP protocol must expose exactly chat and confirm at public; received: chat, confirm, system_search",
    );
  });
});
