// With moduleResolution: "bundler", we can export implementations safely
export { ConversationService } from "./conversation-service";

export type {
  IConversationService,
  ConversationServiceConfig,
  ConversationMetadata,
  MessageRole,
  GetMessagesOptions,
  StartConversationRequest,
  AddConversationMessageRequest,
  ListConversationsOptions,
  ConversationDigestPayload,
  ConversationDbConfig,
} from "./types";
export {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_SOURCE_KIND,
  CONVERSATION_STARTED_CHANNEL,
  conversationDigestPayloadSchema,
} from "./types";

// Schema types for compatibility - consider importing from /service if you need these
export type {
  Conversation,
  Message,
  NewConversation,
  NewMessage,
  SummaryTracking,
  NewSummaryTracking,
} from "./schema";
