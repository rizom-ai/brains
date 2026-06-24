import { z } from "@brains/utils";

export const AGENT_CONTEXT_REQUEST_CHANNEL = "agent:context:request";

export type AgentContextPermissionLevel = "anchor" | "trusted" | "public";

export interface AgentContextRequest {
  conversationId: string;
  message: string;
  interfaceType: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  userPermissionLevel: AgentContextPermissionLevel;
}

export interface AgentContextItem {
  id: string;
  source: string;
  title?: string | undefined;
  content: string;
  provenance?: Record<string, unknown> | undefined;
}

export interface AgentContextResponse {
  items: AgentContextItem[];
}

export const agentContextPermissionLevelSchema: z.ZodType<AgentContextPermissionLevel> =
  z.enum(["anchor", "trusted", "public"]);

export const agentContextRequestSchema: z.ZodType<AgentContextRequest> =
  z.object({
    conversationId: z.string().min(1),
    message: z.string(),
    interfaceType: z.string().min(1),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    userPermissionLevel: agentContextPermissionLevelSchema,
  });

export const agentContextItemSchema: z.ZodType<AgentContextItem> = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export const agentContextResponseSchema: z.ZodType<
  AgentContextResponse,
  z.ZodTypeDef,
  { items?: AgentContextItem[] | undefined }
> = z.object({
  items: z.array(agentContextItemSchema).default([]),
});

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
