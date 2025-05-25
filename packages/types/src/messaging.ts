/**
 * Base message structure
 */
export interface BaseMessage {
  id: string;
  type: string;
  timestamp: string;
  sender?: string;
}

/**
 * Message with payload
 */
export interface MessageWithPayload<T = unknown> extends BaseMessage {
  payload: T;
}

/**
 * Message response
 */
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Message handler function
 */
export type MessageHandler<T = unknown, R = unknown> = (
  message: MessageWithPayload<T>
) => Promise<MessageResponse<R>> | MessageResponse<R>;

/**
 * Message bus interface
 */
export interface MessageBus {
  send<T = unknown, R = unknown>(
    type: string,
    payload: T,
    sender?: string
  ): Promise<MessageResponse<R>>;
  
  subscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>
  ): () => void;
  
  unsubscribe(type: string, handler: MessageHandler): void;
}