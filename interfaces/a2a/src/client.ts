import { z } from "@brains/utils";
import type { Tool, ToolResponse, ParsedAgentCard } from "@brains/plugins";
import { parseAgentCard } from "@brains/plugins";

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

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_NETWORK_ATTEMPTS = 2;

const a2aCallInputSchema = {
  agent: z
    .string()
    .describe(
      "Saved local agent id from your directory, usually a domain-like id such as yeehaa.io. Never pass a display name like Brain or a URL.",
    ),
  message: z.string().describe("Message to send to the remote agent"),
};

function normalizeSavedAgentId(agent: string): string | null {
  const trimmed = agent.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return null;
  }
  if (/^[^\s/]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

async function fetchAgentCard(
  agentUrl: string,
  fetchFn: FetchFn,
): Promise<ParsedAgentCard | null> {
  const cardUrl = agentUrl.replace(/\/$/, "") + "/.well-known/agent-card.json";
  try {
    const response = await fetchFn(cardUrl);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return parseAgentCard(data);
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
  authToken: string | undefined,
  options: Required<A2ANetworkOptions>,
): Promise<ToolResponse> {
  const maxAttempts = Math.max(1, options.maxNetworkAttempts);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetchWithTimeout(
        fetchFn,
        endpointUrl,
        {
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
        },
        options.requestTimeoutMs,
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Remote agent returned HTTP ${response.status}`,
        };
      }

      if (!response.body) {
        return { success: false, error: "No response body (SSE expected)" };
      }

      return await readStreamToCompletion(
        response.body,
        options.streamIdleTimeoutMs,
      );
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isRetryableNetworkError(err)) {
        continue;
      }
      break;
    }
  }

  return {
    success: false,
    error: formatNetworkFailure(lastError, maxAttempts),
  };
}

/**
 * Read an SSE stream until a final status-update event arrives.
 * Returns the parsed result from the terminal event.
 */
async function readStreamToCompletion(
  body: ReadableStream<Uint8Array>,
  streamIdleTimeoutMs: number,
): Promise<ToolResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let chunk = await readChunkWithIdleTimeout(reader, streamIdleTimeoutMs);
  while (!chunk.done) {
    buffer += decoder.decode(chunk.value, { stream: true });

    // Parse SSE events (data: {...}\n\n)
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
      } catch {
        reader.cancel().catch(() => {});
        return {
          success: false,
          error: "Malformed SSE event from remote agent",
        };
      }

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

    chunk = await readChunkWithIdleTimeout(reader, streamIdleTimeoutMs);
  }

  return { success: false, error: "Stream ended without a terminal event" };
}

class A2ARequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`);
    this.name = "A2ARequestTimeoutError";
  }
}

class A2AStreamIdleTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`A2A stream stalled waiting for final event after ${timeoutMs}ms`);
    this.name = "A2AStreamIdleTimeoutError";
  }
}

async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchFn(url, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new A2ARequestTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof A2ARequestTimeoutError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new A2ARequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function readChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<
  Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]>>
> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new A2AStreamIdleTimeoutError(timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof A2AStreamIdleTimeoutError) {
      reader.cancel().catch(() => {});
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isRetryableNetworkError(error: unknown): boolean {
  if (
    error instanceof A2ARequestTimeoutError ||
    error instanceof A2AStreamIdleTimeoutError
  ) {
    return true;
  }

  return error instanceof Error;
}

function formatNetworkFailure(error: unknown, attempts: number): string {
  const suffix = attempts > 1 ? ` after ${attempts} attempts` : "";

  if (error instanceof A2AStreamIdleTimeoutError) {
    return `${error.message}${suffix}`;
  }

  const cause =
    error instanceof Error ? error.message : "Unknown network error";
  return `Failed to reach remote agent${suffix}: ${cause}`;
}

// -- Tool factory --

export interface A2ANetworkOptions {
  /** Max time to receive POST response headers. */
  requestTimeoutMs?: number;
  /** Max time between SSE chunks before treating the stream as stalled. */
  streamIdleTimeoutMs?: number;
  /** Network attempts for transient failures. */
  maxNetworkAttempts?: number;
}

export interface A2AClientDeps extends A2ANetworkOptions {
  fetch?: FetchFn;
  /** Map of remote agent domain → bearer token to send */
  outboundTokens?: Record<string, string>;
  /** Entity service for agent directory resolution */
  entityService?: {
    getEntity(request: { entityType: string; id: string }): Promise<{
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
  const networkOptions: Required<A2ANetworkOptions> = {
    requestTimeoutMs: deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    streamIdleTimeoutMs:
      deps.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxNetworkAttempts: deps.maxNetworkAttempts ?? DEFAULT_MAX_NETWORK_ATTEMPTS,
  };

  return {
    name: "a2a_call",
    description:
      "Call a saved remote A2A agent by its local directory id. Use only a saved agent id such as yeehaa.io. Never pass a display name like Brain, never pass a full URL, and do not use this tool to probe whether an agent exists. If the user gives a URL, an unsaved agent, or an ambiguous name, ask them to add/save or clarify the agent first.",
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
      const agentId = normalizeSavedAgentId(agent);

      if (!agentId) {
        return {
          success: false,
          error:
            "Invalid agent id. Use a saved agent id from your directory, not a URL.",
        };
      }

      if (!deps.entityService) {
        return {
          success: false,
          error:
            "Agent directory is unavailable. Add the agent first, then try again.",
        };
      }

      const entity = await deps.entityService.getEntity({
        entityType: "agent",
        id: agentId,
      });
      if (!entity) {
        return {
          success: false,
          error: `Agent ${agentId} is not in your directory. Add it first.`,
        };
      }

      if (entity.metadata["status"] !== "approved") {
        return {
          success: false,
          error: `Agent ${agentId} is discovered but not approved yet. Approve it first.`,
        };
      }

      const cardBaseUrl = `https://${agentId}`;
      const card = await fetchAgentCard(cardBaseUrl, fetchFn);
      if (!card) {
        return {
          success: false,
          error: `Could not fetch Agent Card from ${cardBaseUrl}`,
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

      return sendMessage(
        endpointUrl,
        message,
        fetchFn,
        authToken,
        networkOptions,
      );
    },
  };
}
