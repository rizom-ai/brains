import { z } from "@brains/utils/zod";
import { messageRoleSchema, type MessageRole } from "@brains/contracts";
import { ExtensionMetadataSchema } from "./metadata";

// The canonical message-role contract lives in @brains/contracts; surface it
// here alongside the Conversation/Message contracts it belongs with.
export { messageRoleSchema };
export type { MessageRole };

export const ConversationSchema: z.ZodObject<{
  id: z.ZodString;
  sessionId: z.ZodString;
  interfaceType: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  startedAt: z.ZodString;
  lastActiveAt: z.ZodString;
  createdAt: z.ZodString;
  updatedAt: z.ZodString;
  metadata: typeof ExtensionMetadataSchema;
}> = z.object({
  id: z.string(),
  sessionId: z.string(),
  interfaceType: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: ExtensionMetadataSchema,
});

export type Conversation = z.output<typeof ConversationSchema>;

export const MessageSchema: z.ZodObject<{
  id: z.ZodString;
  conversationId: z.ZodString;
  role: typeof messageRoleSchema;
  content: z.ZodString;
  timestamp: z.ZodString;
  metadata: typeof ExtensionMetadataSchema;
}> = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  timestamp: z.string(),
  metadata: ExtensionMetadataSchema,
});

export type Message = z.output<typeof MessageSchema>;
