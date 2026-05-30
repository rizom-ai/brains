import { z } from "zod";

export const AGENT_CONTEXT_REQUEST_CHANNEL = "agent:context:request";

export const agentContextPermissionLevelSchema = z.enum([
  "anchor",
  "trusted",
  "public",
]);

export const agentContextRequestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string(),
  interfaceType: z.string().min(1),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  userPermissionLevel: agentContextPermissionLevelSchema,
});

export type AgentContextRequest = z.infer<typeof agentContextRequestSchema>;

export const agentContextItemSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export type AgentContextItem = z.infer<typeof agentContextItemSchema>;

export const agentContextResponseSchema = z.object({
  items: z.array(agentContextItemSchema).default([]),
});

export type AgentContextResponse = z.infer<typeof agentContextResponseSchema>;

/**
 * Parse a context-provider response leniently: drop individual items that fail
 * validation instead of throwing the whole batch. A single malformed item (e.g.
 * an empty excerpt failing `content.min(1)`) must not discard every other piece
 * of retrieved memory for the turn.
 */
export function parseAgentContextItems(data: unknown): AgentContextItem[] {
  const envelope = z.object({ items: z.array(z.unknown()).default([]) });
  const parsed = envelope.safeParse(data);
  if (!parsed.success) return [];

  return parsed.data.items.flatMap((item) => {
    const result = agentContextItemSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}
