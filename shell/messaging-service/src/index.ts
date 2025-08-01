export { MessageBus } from "./messageBus";
export type {
  BaseMessage,
  MessageResponse,
  MessageHandler,
  MessageSender,
  MessageWithPayload,
  IMessageBus,
  MessageContext,
} from "./types";
export {
  baseMessageSchema,
  messageWithPayloadSchema,
  messageResponseSchema,
  internalMessageResponseSchema,
  hasPayload,
} from "./types";

// Export error classes
export {
  MessageDeliveryError,
  HandlerRegistrationError,
  HandlerExecutionError,
  MessageTimeoutError,
  InvalidMessageFormatError,
  MessageBusNotInitializedError,
  CircularMessageDependencyError,
} from "./errors";
