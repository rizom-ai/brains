// With moduleResolution: "bundler", we can export implementations safely
export { ConversationService } from "./conversation-service";

export type {
  IConversationService,
  ConversationServiceConfig,
  MessageRole,
  GetMessagesOptions,
  ConversationDigestPayload,
  ConversationDbConfig,
} from "./types";
export { conversationDigestPayloadSchema } from "./types";

// Schema types for compatibility - consider importing from /service if you need these
export type {
  Conversation,
  Message,
  NewConversation,
  NewMessage,
  SummaryTracking,
  NewSummaryTracking,
} from "./schema";
