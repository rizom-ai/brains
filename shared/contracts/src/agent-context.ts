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
