/**
 * ConversationContext module for managing conversations
 */

// Export MCP implementation
export { MCPConversationContext } from './MCPConversationContext';

// Export configuration types
export type { MCPConversationContextOptions, ConversationToolContext } from './MCPConversationContext';

// Export the storage adapter as it's needed for extension/configuration
export { ConversationStorageAdapter } from './conversationStorageAdapter';

// Export primary storage interfaces needed by public API users
export type { ConversationStorage } from './storage/conversationStorage';
export type { NewConversation, ConversationSummary, ConversationInfo } from './storage/conversationStorage';

// Export service interfaces needed for MCPConversationContext
export type { ConversationMemoryService } from './services/conversationMemoryService';
export type { ConversationQueryService } from './services/conversationQueryService';
export type { ConversationNotifier } from './messaging/conversationNotifier';