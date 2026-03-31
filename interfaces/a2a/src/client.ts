import { z } from "@brains/utils";
import type { Tool, ToolResponse } from "@brains/plugins";

/**
 * Validated agent card fields from discovery.
 * Intentionally narrow — validate only what we use.
 * Extend as more fields are needed.
 */
const agentCardSchema = z.object({
  name: z.string(),
  url: z.string(),
  skills: z
    .array(z.object({ id: z.string(), description: z.string() }).passthrough())
    .optional()
    .default([]),
});

export type DiscoveredAgentCard = z.infer<typeof agentCardSchema>;

/**
 * Parse a raw response into a discovered agent card, returning null if invalid.
 */
export function parseAgentCardResponse(
  data: unknown,
): DiscoveredAgentCard | null {
  const parsed = agentCardSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

interface A2ASuccess {
  success: true;
  data: {
    state: string;
    response: string;
    taskId?: string;
  };
}

interface A2AError {
  success: false;
  error: string;
}

type A2AResult = A2ASuccess | A2AError;

const textPartSchema = z.object({
  kind: z.literal("text"),
  text: z.string(),
});

const partsSchema = z.array(z.object({ kind: z.string() }).passthrough());

const rpcErrorSchema = z.object({
  error: z.object({ message: z.string() }),
});

const messageResultSchema = z.object({
  kind: z.literal("message"),
  parts: partsSchema,
});

const taskResultSchema = z.object({
  kind: z.literal("task"),
  id: z.string().optional(),
  status: z.object({
    state: z.string(),
    message: z.object({ parts: partsSchema }).optional(),
  }),
});

const resultEnvelopeSchema = z.object({ result: z.unknown() });

/**
 * Extract text from a parts array
 */
function extractText(parts: z.infer<typeof partsSchema>): string {
  const texts: string[] = [];
  for (const part of parts) {
    const parsed = textPartSchema.safeParse(part);
    if (parsed.success) {
      texts.push(parsed.data.text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : "No response text";
}

/**
 * Parse a JSON-RPC response from an A2A server into a structured result.
 */
export function parseA2AResponse(data: unknown): A2AResult {
  if (typeof data !== "object" || data === null) {
    return { success: false, error: "Invalid response" };
  }

  // Check for JSON-RPC error
  const errorParsed = rpcErrorSchema.safeParse(data);
  if (errorParsed.success) {
    return { success: false, error: errorParsed.data.error.message };
  }

  const resultParsed = resultEnvelopeSchema.safeParse(data);
  if (!resultParsed.success || resultParsed.data.result === undefined) {
    return {
      success: true,
      data: { state: "unknown", response: "No response text" },
    };
  }

  const result = resultParsed.data.result;

  // Message response (not a task)
  const messageParsed = messageResultSchema.safeParse(result);
  if (messageParsed.success) {
    return {
      success: true,
      data: {
        state: "completed",
        response: extractText(messageParsed.data.parts),
      },
    };
  }

  // Task response
  const taskParsed = taskResultSchema.safeParse(result);
  if (taskParsed.success) {
    const { status, id } = taskParsed.data;
    const parts = status.message?.parts ?? [];
    return {
      success: true,
      data: {
        state: status.state,
        response: extractText(parts),
        taskId: id,
      },
    };
  }

  return {
    success: true,
    data: { state: "unknown", response: "No response text" },
  };
}

// -- Network functions --

type FetchFn = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const a2aCallInputSchema = {
  agent: z
    .string()
    .describe("URL of the remote agent (e.g. https://yeehaa.io)"),
  message: z.string().describe("Message to send to the remote agent"),
};

async function fetchAgentCard(
  agentUrl: string,
  fetchFn: FetchFn,
): Promise<DiscoveredAgentCard | null> {
  const cardUrl = agentUrl.replace(/\/$/, "") + "/.well-known/agent-card.json";
  try {
    const response = await fetchFn(cardUrl);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return parseAgentCardResponse(data);
  } catch {
    return null;
  }
}

/**
 * Send a message via message/stream (SSE) and wait for the final result.
 * Reads the SSE stream until a terminal status-update event arrives.
 */
async function sendMessage(
  endpointUrl: string,
  message: string,
  fetchFn: FetchFn,
  authToken?: string,
): Promise<ToolResponse> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetchFn(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "message/stream",
        params: {
          message: {
            kind: "message",
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text: message }],
          },
        },
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Remote agent returned HTTP ${response.status}`,
      };
    }

    if (!response.body) {
      return { success: false, error: "No response body (SSE expected)" };
    }

    return await readStreamToCompletion(response.body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown network error";
    return { success: false, error: `Failed to reach remote agent: ${msg}` };
  }
}

/**
 * Read an SSE stream until a final status-update event arrives.
 * Returns the parsed result from the terminal event.
 */
async function readStreamToCompletion(
  body: ReadableStream<Uint8Array>,
): Promise<ToolResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let chunk = await reader.read();
  while (!chunk.done) {
    buffer += decoder.decode(chunk.value, { stream: true });

    // Parse SSE events (data: {...}\n\n)
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;

      const event = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

      // Check if this is a JSON-RPC envelope with a result
      const result = event["result"] as Record<string, unknown> | undefined;
      if (!result) continue;

      const isFinal = result["final"] === true;
      if (!isFinal) continue;

      // Terminal event — extract response
      reader.cancel().catch(() => {});
      const status = result["status"] as
        | {
            state: string;
            message?: { parts: Array<{ kind: string; text?: string }> };
          }
        | undefined;

      const state = status?.state ?? "unknown";
      const responseParts = status?.message?.parts ?? [];
      const responseText =
        responseParts
          .filter(
            (p): p is { kind: "text"; text: string } =>
              p.kind === "text" && typeof p.text === "string",
          )
          .map((p) => p.text)
          .join("\n") || "No response text";

      return {
        success: true,
        data: { state, response: responseText },
      };
    }

    chunk = await reader.read();
  }

  return { success: false, error: "Stream ended without a terminal event" };
}

// -- Tool factory --

export interface A2AClientDeps {
  fetch?: FetchFn;
  /** Map of remote agent domain → bearer token to send */
  outboundTokens?: Record<string, string>;
  /** Entity service for agent directory resolution */
  entityService?: {
    getEntity(
      type: string,
      id: string,
    ): Promise<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
    } | null>;
  };
}

/**
 * Create the a2a_call tool for calling remote A2A agents
 */
export function createA2ACallTool(deps: A2AClientDeps = {}): Tool {
  const fetchFn = deps.fetch ?? globalThis.fetch;

  return {
    name: "a2a_call",
    description:
      "Call a remote A2A agent. Discovers the agent via its Agent Card, sends a message, and returns the response.",
    inputSchema: a2aCallInputSchema,
    visibility: "anchor",
    handler: async (input): Promise<ToolResponse> => {
      const parsed = z.object(a2aCallInputSchema).safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      const { agent, message } = parsed.data;

      // Resolve agent to a URL
      let agentUrl = agent;
      const isFullUrl =
        agent.startsWith("http://") || agent.startsWith("https://");

      if (!isFullUrl && deps.entityService) {
        // Try entity lookup by ID (domain)
        const entity = await deps.entityService.getEntity("agent", agent);
        if (entity) {
          // Refuse archived agents
          if (entity.metadata["status"] === "archived") {
            return {
              success: false,
              error: `Agent ${agent} is archived. Use agent_add to re-activate.`,
            };
          }
          const entityUrl = entity.metadata["url"];
          if (typeof entityUrl === "string") {
            agentUrl = entityUrl;
          }
        }
      }

      // Ensure agentUrl is a full URL for Agent Card fetch
      if (!agentUrl.startsWith("http")) {
        agentUrl = `https://${agentUrl}`;
      }

      const card = await fetchAgentCard(agentUrl, fetchFn);
      if (!card) {
        return {
          success: false,
          error: `Could not fetch Agent Card from ${agentUrl}`,
        };
      }

      const endpointUrl = card.url;

      // Look up outbound token by agent domain
      let authToken: string | undefined;
      if (deps.outboundTokens) {
        try {
          const domain = new URL(endpointUrl).hostname;
          authToken = deps.outboundTokens[domain];
        } catch {
          // Invalid URL — skip token
        }
      }

      return sendMessage(endpointUrl, message, fetchFn, authToken);
    },
  };
}
