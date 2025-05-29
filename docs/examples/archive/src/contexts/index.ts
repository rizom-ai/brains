/**
 * Contexts Layer
 * 
 * This module exports the domain contexts for interacting with different data domains.
 * Each context provides a specialized interface for a specific type of data or service.
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 */

// Export MCP implementations
export { MCPConversationContext } from './conversations';
export { MCPExternalSourceContext } from './externalSources';
export { MCPNoteContext } from './notes';
export { MCPProfileContext } from './profiles';
export { MCPWebsiteContext } from './website';