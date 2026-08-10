// With moduleResolution: "bundler", we can export implementations safely
export { ConversationService } from "./conversation-service";
export { RemoteConversationService } from "./remote-conversation-service";
export { coerceConversationMetadata } from "./metadata";
export {
  CONVERSATION_RPC_SERVICE,
  ConversationRpcRequestSchema,
  handleConversationRpcRequest,
  parseConversationRpcRequest,
  parseConversationRpcResult,
} from "./conversation-rpc";
export type {
  ConversationRpcRequest,
  ConversationRpcTransport,
} from "./conversation-rpc";

export type {
  IConversationService,
  ConversationServiceConfig,
  ConversationMetadata,
  GetMessagesOptions,
  StartConversationRequest,
  AddConversationMessageRequest,
  UpdateConversationMetadataRequest,
  ListConversationsOptions,
  ConversationDigestPayload,
  ConversationMessageActor,
  ConversationMessageSource,
  ConversationMessageMetadata,
  ConversationDbConfig,
} from "./types";
export {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_SOURCE_KIND,
  CONVERSATION_STARTED_CHANNEL,
  conversationDigestPayloadSchema,
  conversationMessageActorSchema,
  conversationMessageSourceSchema,
  conversationMessageMetadataSchema,
  isSavableAssistantMessage,
  parseConversationMessageMetadata,
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
