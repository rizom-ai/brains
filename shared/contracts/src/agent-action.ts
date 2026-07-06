import { z } from "@brains/utils/zod";

export const AGENT_ACTION_REQUEST_CHANNEL = "agent:action:request";

export interface AgentEventAction {
  type: "event";
  event: string;
}

export interface AgentActionRequest {
  conversationId: string;
  interfaceType: string;
  channelId?: string | undefined;
  channelName: string;
  userPermissionLevel: "anchor" | "trusted" | "public";
  action: AgentEventAction;
}

export const agentEventActionSchema: z.ZodType<
  AgentEventAction,
  AgentEventAction
> = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
});

export const agentActionRequestSchema: z.ZodType<
  AgentActionRequest,
  AgentActionRequest
> = z.object({
  conversationId: z.string().min(1),
  interfaceType: z.string().min(1),
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1),
  userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  action: agentEventActionSchema,
});
