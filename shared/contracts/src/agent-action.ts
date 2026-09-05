import { z } from "@brains/utils/zod";

export const AGENT_ACTION_REQUEST_CHANNEL = "agent:action:request";

type AgentEventActionSchema = z.ZodObject<{
  type: z.ZodLiteral<"event">;
  event: z.ZodString;
  fromState: z.ZodOptional<z.ZodString>;
}>;

export const agentEventActionSchema: AgentEventActionSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  /** State id the action was rendered for; lets handlers reject stale events. */
  fromState: z.string().min(1).optional(),
});

export type AgentEventAction = z.output<typeof agentEventActionSchema>;

type AgentActionRequestSchema = z.ZodObject<{
  conversationId: z.ZodString;
  interfaceType: z.ZodString;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodString;
  userPermissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
  isAnchor: z.ZodBoolean;
  action: AgentEventActionSchema;
}>;

export const agentActionRequestSchema: AgentActionRequestSchema = z.object({
  conversationId: z.string().min(1),
  interfaceType: z.string().min(1),
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1),
  userPermissionLevel: z.enum(["admin", "trusted", "public"]),
  isAnchor: z.boolean(),
  action: agentEventActionSchema,
});

export type AgentActionRequest = z.output<typeof agentActionRequestSchema>;
