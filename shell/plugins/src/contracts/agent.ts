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
  id: z.string().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  description: z.string(),
  args: z.unknown(),
});

export type PendingConfirmation = z.infer<typeof PendingConfirmationSchema>;

export const ToolApprovalCardStateSchema = z.enum([
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-denied",
  "output-error",
]);

export const ToolApprovalCardSchema = z.object({
  kind: z.literal("tool-approval"),
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  input: z.record(z.unknown()).optional(),
  description: z.string(),
  state: ToolApprovalCardStateSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export type ToolApprovalCard = z.infer<typeof ToolApprovalCardSchema>;

export const StructuredChatCardSchema = ToolApprovalCardSchema;

export type StructuredChatCard = z.infer<typeof StructuredChatCardSchema>;

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
  cards: z.array(StructuredChatCardSchema).optional(),
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
