export { MessageBus } from "./messageBus";
export type {
  BaseMessage,
  MessageResponse,
  MessageHandler,
  MessageSender,
  MessageSendOptions,
  MessageSendRequest,
  MessageBusSendRequest,
  MessageWithPayload,
  IMessageBus,
  MessageContext,
  SubscriptionFilter,
} from "./types";
export {
  baseMessageSchema,
  messageWithPayloadSchema,
  messageResponseSchema,
  internalMessageResponseSchema,
  hasPayload,
} from "./types";
// Part of IMessageBus's own signature, so anything implementing the interface
// needs to name these — a fake that cannot say `MessageValidationResult` ends
// up inventing a looser signature instead.
export { validateMessage } from "./message-validator";
export type {
  MessageValidationResult,
  MessageValidationSchema,
} from "./message-validator";
