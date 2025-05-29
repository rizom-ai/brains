/**
 * MCP Server
 * 
 * Creates a unified MCP server with all contexts registered.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { MCPConversationContext } from '@/contexts/conversations';
import { MCPExternalSourceContext } from '@/contexts/externalSources';
import { MCPNoteContext } from '@/contexts/notes';
import { MCPProfileContext } from '@/contexts/profiles';
import { MCPWebsiteContext } from '@/contexts/website';
import { isTestEnvironment } from '@/utils/configUtils';

// Export the McpServer type directly
export type { McpServer };

/**
 * Configuration options for the MCP server
 */
export interface McpServerConfig {
  /** API key for Claude and other API services */
  apiKey?: string;
  /** NewsAPI key for external sources */
  newsApiKey?: string;
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
  /** Enable external sources */
  enableExternalSources?: boolean;
}

/**
 * Creates a unified MCP server with all context resources and tools registered
 * 
 * @param config Configuration options for the unified MCP server
 * @returns A configured McpServer instance with all resources and tools
 */
export function createUnifiedMcpServer(config: McpServerConfig = {}): McpServer {
  // Create the unified MCP server with defaults
  const mcpServer = new McpServer({
    name: config.name || 'PersonalBrain',
    version: config.version || '1.0.0',
  });
  
  // Use singleton instances of all contexts
  const noteContext = MCPNoteContext.getInstance({ apiKey: config.apiKey });
  const profileContext = MCPProfileContext.getInstance();
  const externalSourceContext = MCPExternalSourceContext.getInstance({ 
    apiKey: config.apiKey, 
    newsApiKey: config.newsApiKey,
    // Initialize external sources as enabled or disabled based on config
    enabledSources: config.enableExternalSources === false ? [] : undefined,
  });
  const conversationContext = MCPConversationContext.getInstance();
  const websiteContext = MCPWebsiteContext.getInstance();
  
  // Initialize contexts first (this should be done asynchronously in a real scenario)
  // Skip registration in test environment
  if (mcpServer && !isTestEnvironment()) {
    // Register all contexts on the unified server with proper error handling
    try {
      noteContext.registerOnServer(mcpServer);
    } catch (error) {
      console.warn('Error registering NoteContext, continuing without it:', error);
    }
    
    try {
      profileContext.registerOnServer(mcpServer);
    } catch (error) {
      console.warn('Error registering ProfileContext, continuing without it:', error);
    }
    
    try {
      externalSourceContext.registerOnServer(mcpServer);
    } catch (error) {
      console.warn('Error registering ExternalSourceContext, continuing without it:', error);
    }
    
    try {
      conversationContext.registerOnServer(mcpServer);
    } catch (error) {
      console.warn('Error registering ConversationContext, continuing without it:', error);
    }
    
    try {
      websiteContext.registerOnServer(mcpServer);
    } catch (error) {
      console.warn('Error registering WebsiteContext, continuing without it:', error);
    }
  }
  
  return mcpServer;
}