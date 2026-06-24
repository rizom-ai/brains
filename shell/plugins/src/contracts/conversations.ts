import { z } from "@brains/utils/zod";
import { messageRoleSchema, type MessageRole } from "@brains/contracts";
import { ExtensionMetadataSchema } from "./metadata";

// The canonical message-role contract lives in @brains/contracts; surface it
// here alongside the Conversation/Message contracts it belongs with.
export { messageRoleSchema };
export type { MessageRole };

export const ConversationSchema = z.object({
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

export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  timestamp: z.string(),
  metadata: ExtensionMetadataSchema,
});

export type Message = z.infer<typeof MessageSchema>;
