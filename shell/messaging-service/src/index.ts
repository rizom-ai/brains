export { MessageBus } from "./messageBus";
export type {
  BaseMessage,
  MessageResponse,
  MessageHandler,
  MessageSender,
  MessageWithPayload,
  IMessageBus,
  MessageBusResponse,
} from "./types";
export {
  baseMessageSchema,
  messageWithPayloadSchema,
  messageBusResponseSchema,
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
