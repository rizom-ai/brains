import { z } from "zod";
import { ExtensionMetadataSchema } from "./metadata";

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

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

export type MessageRole = z.infer<typeof messageRoleSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  timestamp: z.string(),
  metadata: ExtensionMetadataSchema,
});

export type Message = z.infer<typeof MessageSchema>;
