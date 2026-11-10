import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import type { IAgentService } from "@brains/ai-service";
import type { ChatContext, AgentResponse } from "@brains/ai-service";
import { parseAgentResponse } from "@brains/contracts";
import type { IMCPTransport } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";

interface ProtocolConnection {
  client: Client;
  close(): Promise<void>;
}

/** Opens the protocol client one kind of caller talks through. */
type OpenConnection = (
  permissionLevel: UserPermissionLevel,
  isAnchor: boolean,
) => Promise<ProtocolConnection>;

export interface RemoteMCPConnectionOptions {
  /** The running brain's base URL; its MCP endpoint is `<url>/mcp`. */
  url: string;
  /** The brain's static development bearer token (`MCP_AUTH_TOKEN`). */
  token?: string | undefined;
  /** Injected so a test can answer requests without a server. */
  fetch?: FetchLike;
}

interface ChatSuccessPayload {
  text: string;
  toolResults?: unknown;
}

interface ConfirmationPayload {
  needsConfirmation: true;
  toolName: string;
  summary: string;
  completionSummary?: string;
  preview?: string;
  /** The reply the agent wrote, with the request below it. */
  text?: string;
  args: Record<string, unknown>;
}

const BASIC_PROTOCOL_TOOLS = ["chat", "confirm"] as const;
const PERMISSION_LEVELS: UserPermissionLevel[] = ["public", "trusted", "admin"];
const EMPTY_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

/**
 * Runs behavioral evaluations through the public basic MCP protocol instead of
 * calling IAgentService directly. The adapter intentionally rejects any basic
 * surface other than chat + confirm before the first evaluation starts.
 */
export class MCPProtocolAgentService implements IAgentService {
  private readonly connections = new Map<string, Promise<ProtocolConnection>>();
  private readonly open: OpenConnection;

  private constructor(open: OpenConnection) {
    this.open = open;
  }

  /** Evaluate the booted eval brain's own MCP surface, in process. */
  public static async connect(
    mcpTransport: IMCPTransport,
  ): Promise<MCPProtocolAgentService> {
    mcpTransport.setProtocolMode("basic");
    return MCPProtocolAgentService.verified(
      new MCPProtocolAgentService((permissionLevel, isAnchor) =>
        openInProcess(mcpTransport, permissionLevel, isAnchor),
      ),
      PERMISSION_LEVELS,
    );
  }

  /**
   * Evaluate a running brain through its HTTP MCP endpoint, for cases that need
   * what only a supervised brain has, such as Git. The static token always
   * authenticates a non-Anchor Admin, so a case needing any other caller is
   * refused rather than run as the wrong one.
   */
  public static async connectRemote(
    options: RemoteMCPConnectionOptions,
  ): Promise<MCPProtocolAgentService> {
    return MCPProtocolAgentService.verified(
      new MCPProtocolAgentService((permissionLevel, isAnchor) =>
        openRemote(options, permissionLevel, isAnchor),
      ),
      ["admin"],
    );
  }

  private static async verified(
    service: MCPProtocolAgentService,
    permissionLevels: UserPermissionLevel[],
  ): Promise<MCPProtocolAgentService> {
    for (const permissionLevel of permissionLevels) {
      const { client } = await service.getConnection(permissionLevel, false);
      const listed = await client.listTools();
      const names = listed.tools.map(({ name }) => name).sort();
      const expected = [...BASIC_PROTOCOL_TOOLS].sort();
      if (JSON.stringify(names) !== JSON.stringify(expected)) {
        await service.close();
        throw new Error(
          `Basic MCP protocol must expose exactly chat and confirm at ${permissionLevel}; received: ${names.join(", ")}`,
        );
      }
    }

    return service;
  }

  public async chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    // The protocol's chat takes a message only. Sending the turn without
    // its files would evaluate a different request than the case asks.
    const attachments = context?.attachments ?? [];
    if (attachments.length > 0) {
      throw new Error(
        `Basic MCP chat carries no attachments: ${attachments.map((attachment) => attachment.filename).join(", ")} cannot reach the brain through it`,
      );
    }
    return this.callProtocolTool(
      "chat",
      { message, conversationId },
      context,
      signal,
    );
  }

  public async confirmPendingAction(
    conversationId: string,
    approved: boolean,
    confirmationId: string,
    context: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    return this.callProtocolTool(
      "confirm",
      { approvalId: confirmationId, confirmed: approved, conversationId },
      context,
      signal,
    );
  }

  public invalidateAgent(): void {
    // MCP is the protocol boundary under evaluation; there is no local agent
    // cache for this adapter to invalidate.
  }

  public async close(): Promise<void> {
    const connections = await Promise.allSettled(this.connections.values());
    this.connections.clear();
    await Promise.all(
      connections.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.close()] : [],
      ),
    );
  }

  private async callProtocolTool(
    name: "chat" | "confirm",
    args: Record<string, unknown>,
    context: ChatContext | undefined,
    signal: AbortSignal | undefined,
  ): Promise<AgentResponse> {
    signal?.throwIfAborted();
    const permissionLevel = context?.userPermissionLevel ?? "public";
    const isAnchor = context?.isAnchor ?? false;
    const { client } = await this.getConnection(permissionLevel, isAnchor);
    const result = await client.callTool({ name, arguments: args });
    signal?.throwIfAborted();
    return protocolPayloadToAgentResponse(parseProtocolPayload(result));
  }

  private getConnection(
    permissionLevel: UserPermissionLevel,
    isAnchor: boolean,
  ): Promise<ProtocolConnection> {
    const key = `${permissionLevel}:${isAnchor ? "anchor" : "member"}`;
    const existing = this.connections.get(key);
    if (existing) return existing;

    const connection = this.open(permissionLevel, isAnchor);
    this.connections.set(key, connection);
    return connection;
  }
}

function createClient(): Client {
  return new Client({ name: "brains-ai-evaluation", version: "1.0.0" });
}

async function openInProcess(
  mcpTransport: IMCPTransport,
  permissionLevel: UserPermissionLevel,
  isAnchor: boolean,
): Promise<ProtocolConnection> {
  mcpTransport.setAnchorStatus?.(isAnchor);
  const server: McpServer = mcpTransport.createMcpServer(permissionLevel);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = createClient();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async (): Promise<void> => {
      await Promise.all([client.close(), server.close()]);
    },
  };
}

async function openRemote(
  options: RemoteMCPConnectionOptions,
  permissionLevel: UserPermissionLevel,
  isAnchor: boolean,
): Promise<ProtocolConnection> {
  if (permissionLevel !== "admin" || isAnchor) {
    throw new Error(
      `A remote MCP eval runs as the token's caller, a non-Anchor Admin; this case needs ${isAnchor ? `an ${permissionLevel} Anchor` : `a ${permissionLevel}`} caller`,
    );
  }
  const client = createClient();
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", options.url), {
      ...(options.token
        ? {
            requestInit: {
              headers: { Authorization: `Bearer ${options.token}` },
            },
          }
        : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    }),
  );
  return { client, close: () => client.close() };
}

function parseProtocolPayload(result: unknown): unknown {
  if (!isRecord(result)) {
    throw new Error("MCP tool returned a non-object result");
  }
  if (result["isError"] === true) {
    throw new Error(readTextContent(result) ?? "MCP tool call failed");
  }

  const text = readTextContent(result);
  if (!text) {
    throw new Error("MCP tool returned no text payload");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MCP tool returned invalid JSON: ${text}`);
  }
}

function readTextContent(result: Record<string, unknown>): string | undefined {
  const content = result["content"];
  if (!Array.isArray(content)) return undefined;
  return content
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) && item["type"] === "text",
    )
    .map((item) => item["text"])
    .filter((text): text is string => typeof text === "string")
    .join("\n");
}

function protocolPayloadToAgentResponse(payload: unknown): AgentResponse {
  if (!isRecord(payload)) {
    throw new Error("MCP tool payload must be an object");
  }
  const normalizedPayload =
    payload["success"] === true && isRecord(payload["data"])
      ? payload["data"]
      : payload;

  if (normalizedPayload["needsConfirmation"] === true) {
    const confirmation = parseConfirmationPayload(normalizedPayload);
    const args = confirmation.args;
    const approvalId = requireString(args["approvalId"], "approvalId");
    return parseAgentResponse({
      text: confirmation.text ?? confirmation.summary,
      pendingConfirmations: [
        {
          id: approvalId,
          toolName: confirmation.toolName,
          summary: confirmation.summary,
          args: args["originalArgs"] ?? {},
          ...(typeof args["toolCallId"] === "string"
            ? { toolCallId: args["toolCallId"] }
            : {}),
          ...(confirmation.completionSummary
            ? { completionSummary: confirmation.completionSummary }
            : {}),
          ...(confirmation.preview ? { preview: confirmation.preview } : {}),
        },
      ],
      usage: EMPTY_USAGE,
    });
  }

  const success = parseChatSuccessPayload(normalizedPayload);
  return parseAgentResponse({
    text: success.text,
    ...(success.toolResults !== undefined
      ? { toolResults: success.toolResults }
      : {}),
    usage: EMPTY_USAGE,
  });
}

function parseChatSuccessPayload(
  payload: Record<string, unknown>,
): ChatSuccessPayload {
  return {
    text: requireString(payload["text"], "text"),
    ...(payload["toolResults"] !== undefined
      ? { toolResults: payload["toolResults"] }
      : {}),
  };
}

function parseConfirmationPayload(
  payload: Record<string, unknown>,
): ConfirmationPayload {
  const args = payload["args"];
  if (!isRecord(args)) {
    throw new Error("MCP confirmation payload is missing args");
  }
  return {
    needsConfirmation: true,
    toolName: requireString(payload["toolName"], "toolName"),
    summary: requireString(payload["summary"], "summary"),
    ...(typeof payload["completionSummary"] === "string"
      ? { completionSummary: payload["completionSummary"] }
      : {}),
    ...(typeof payload["preview"] === "string"
      ? { preview: payload["preview"] }
      : {}),
    ...(typeof payload["text"] === "string" && payload["text"].length > 0
      ? { text: payload["text"] }
      : {}),
    args,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`MCP tool payload is missing ${field}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
