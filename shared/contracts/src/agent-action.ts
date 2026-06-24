import { z } from "zod";

export const AGENT_ACTION_REQUEST_CHANNEL = "agent:action:request";

export const agentEventActionSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
});

export const agentActionRequestSchema = z.object({
  conversationId: z.string().min(1),
  interfaceType: z.string().min(1),
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1),
  userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  action: agentEventActionSchema,
});

export type AgentEventAction = z.infer<typeof agentEventActionSchema>;
export type AgentActionRequest = z.infer<typeof agentActionRequestSchema>;
