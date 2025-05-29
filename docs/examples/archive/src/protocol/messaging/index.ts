/**
 * Cross-Context Messaging Module
 * 
 * This module provides components for standardized communication
 * between contexts in the system.
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 */

// Export public message types needed by context implementations
export type { ContextMessage, ContextCommunicationMessage } from './messageTypes';
export type { 
  DataRequestMessage, 
  DataResponseMessage, 
  NotificationMessage,
  AcknowledgmentMessage,
} from './messageTypes';
export { DataRequestType, NotificationType } from './messageTypes';

// Export public factory for creating messages
export { MessageFactory } from './messageFactory';

// Export mediator interface (needed for contexts to communicate)
export { ContextMediator } from './contextMediator';
export type { MessageHandler } from './contextMediator';