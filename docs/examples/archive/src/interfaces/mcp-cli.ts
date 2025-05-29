/**
 * MCP CLI interface for the Personal Brain
 * This provides a standalone interface to interact with the MCP server
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createUnifiedMcpServer, type McpServerConfig } from '@/mcpServer';
import { getEnv } from '@/utils/configUtils';
import logger from '@/utils/logger';


export interface McpServerOptions {
  apiKey?: string;
  newsApiKey?: string;
  port?: number;
  transports?: ('stdio' | 'sse')[];
}

/**
 * Start the MCP server with the specified options
 * @param options Server configuration options
 * @returns The started MCP server
 */
export async function startMcpServer(options: McpServerOptions = {}): Promise<{
  server: McpServer;
  stop: () => Promise<void>;
}> {
  // Get API keys from options or environment variables
  const apiKey = options.apiKey || getEnv('ANTHROPIC_API_KEY');
  const newsApiKey = options.newsApiKey || getEnv('NEWSAPI_KEY');
  
  // Create server configuration
  const serverConfig: McpServerConfig = {
    apiKey,
    newsApiKey,
    name: 'PersonalBrainMcpServer',
    version: '1.0.0',
    enableExternalSources: true,
  };
  
  // Create unified MCP server
  const server = createUnifiedMcpServer(serverConfig);
  
  // Default to stdio if no transports are specified
  const transports = options.transports || ['stdio'];
  
  // Configure requested transports
  if (transports.includes('stdio')) {
    logger.info('Connecting StdioServerTransport to MCP server');
    server.connect(new StdioServerTransport());
  }
  
  if (transports.includes('sse')) {
    const port = options.port || 8000;
    logger.info(`Connecting SSEServerTransport on port ${port} to MCP server`);
    
    // SSE needs more setup with Express
    logger.warn('SSE transport requires Express server setup - not implemented yet');
    
    // For now, we'll just log a warning
    // In a full implementation, we would:
    // 1. Create an Express server
    // 2. Set up an /sse endpoint for the SSE connection
    // 3. Set up a /messages endpoint for the client to send messages
    // 4. Create and connect the SSEServerTransport
  }
  
  // Log server initialization
  logger.info(`MCP server initialized with transports: ${transports.join(', ')}`);
  
  // Create a stop function to clean up the server
  const stop = async (): Promise<void> => {
    // Close all transports
    logger.info('Stopping MCP server...');
    // Additional cleanup would be defined here as needed
  };
  
  return {
    server,
    stop,
  };
}