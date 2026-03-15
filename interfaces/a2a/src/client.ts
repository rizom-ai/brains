import { z } from "@brains/utils";

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

  const obj = data as { result?: unknown };
  if (!obj.result) {
    return {
      success: true,
      data: { state: "unknown", response: "No response text" },
    };
  }

  // Message response (not a task)
  const messageParsed = messageResultSchema.safeParse(obj.result);
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
  const taskParsed = taskResultSchema.safeParse(obj.result);
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
