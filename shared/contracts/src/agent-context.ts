import { z } from "@brains/utils/zod";

export const AGENT_CONTEXT_REQUEST_CHANNEL = "agent:context:request";

type AgentContextPermissionLevelSchema = z.ZodEnum<{
  admin: "admin";
  trusted: "trusted";
  public: "public";
}>;

export const agentContextPermissionLevelSchema: AgentContextPermissionLevelSchema =
  z.enum(["admin", "trusted", "public"]);

export type AgentContextPermissionLevel = z.output<
  typeof agentContextPermissionLevelSchema
>;

type AgentContextRequestSchema = z.ZodObject<{
  conversationId: z.ZodString;
  message: z.ZodString;
  interfaceType: z.ZodString;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  userPermissionLevel: AgentContextPermissionLevelSchema;
}>;

export const agentContextRequestSchema: AgentContextRequestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string(),
  interfaceType: z.string().min(1),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  userPermissionLevel: agentContextPermissionLevelSchema,
});

export type AgentContextRequest = z.output<typeof agentContextRequestSchema>;

type AgentContextItemSchema = z.ZodObject<{
  id: z.ZodString;
  source: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  content: z.ZodString;
  provenance: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

export const agentContextItemSchema: AgentContextItemSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export type AgentContextItem = z.output<typeof agentContextItemSchema>;

type AgentContextResponseSchema = z.ZodObject<{
  items: z.ZodDefault<z.ZodArray<AgentContextItemSchema>>;
}>;

export const agentContextResponseSchema: AgentContextResponseSchema = z.object({
  items: z.array(agentContextItemSchema).default([]),
});

export type AgentContextResponse = z.output<typeof agentContextResponseSchema>;
export type AgentContextResponseInput = z.input<
  typeof agentContextResponseSchema
>;

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
