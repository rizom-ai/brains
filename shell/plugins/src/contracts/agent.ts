import { UserPermissionLevelSchema } from "@brains/templates";
import { z } from "zod";
import {
  conversationMessageActorSchema,
  conversationMessageSourceSchema,
} from "@brains/conversation-service";

export const ChatContextSchema = z.object({
  userPermissionLevel: UserPermissionLevelSchema.optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  actor: conversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
});

export type ChatContext = z.infer<typeof ChatContextSchema>;

export const PendingConfirmationSchema = z.object({
  toolName: z.string(),
  description: z.string(),
  args: z.unknown(),
});

export type PendingConfirmation = z.infer<typeof PendingConfirmationSchema>;

export const ToolResultDataSchema = z.object({
  toolName: z.string(),
  args: z.record(z.unknown()).optional(),
  jobId: z.string().optional(),
  data: z.unknown().optional(),
});

export type ToolResultData = z.infer<typeof ToolResultDataSchema>;

export const AgentResponseSchema = z.object({
  text: z.string(),
  toolResults: z.array(ToolResultDataSchema).optional(),
  pendingConfirmation: PendingConfirmationSchema.optional(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export interface AgentNamespace {
  chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
  ): Promise<AgentResponse>;
  confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
  ): Promise<AgentResponse>;
  invalidate(): void;
}
