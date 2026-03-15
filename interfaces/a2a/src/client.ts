import { z } from "@brains/utils";
import type { PluginTool, ToolResponse } from "@brains/plugins";

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

  const resultSchema = z.object({ result: z.unknown() });
  const resultParsed = resultSchema.safeParse(data);
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

const a2aCallInputSchema = {
  agent: z
    .string()
    .describe("URL of the remote agent (e.g. https://yeehaa.io)"),
  message: z.string().describe("Message to send to the remote agent"),
};

async function fetchAgentCard(
  agentUrl: string,
): Promise<DiscoveredAgentCard | null> {
  const cardUrl = agentUrl.replace(/\/$/, "") + "/.well-known/agent-card.json";
  try {
    const response = await fetch(cardUrl);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return parseAgentCardResponse(data);
  } catch {
    return null;
  }
}

async function sendMessage(
  endpointUrl: string,
  message: string,
): Promise<ToolResponse> {
  const rpcRequest = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "user",
        parts: [{ kind: "text", text: message }],
      },
    },
  };

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcRequest),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Remote agent returned HTTP ${response.status}`,
      };
    }

    const rpcResponse: unknown = await response.json();
    const parsed = parseA2AResponse(rpcResponse);

    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }

    return { success: true, data: parsed.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown network error";
    return { success: false, error: `Failed to reach remote agent: ${msg}` };
  }
}

// -- Tool factory --

/**
 * Create the a2a_call tool for calling remote A2A agents
 */
export function createA2ACallTool(): PluginTool {
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

      const card = await fetchAgentCard(agent);
      if (!card) {
        return {
          success: false,
          error: `Could not fetch Agent Card from ${agent}`,
        };
      }

      const endpointUrl = card.url.replace(/\/$/, "") + "/a2a";
      return sendMessage(endpointUrl, message);
    },
  };
}
