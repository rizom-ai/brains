/**
 * MCP Server that communicates via stdin/stdout for use with MCP Inspector
 * 
 * This script creates a standard MCP server that uses the stdio transport,
 * allowing it to work with the MCP Inspector tool.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { aiConfig, apiConfig } from './config';
import { createUnifiedMcpServer } from './mcpServer';
import logger from './utils/logger';

/**
 * Create and run an MCP server that communicates via stdin/stdout
 */
async function main() {
  // Load API keys from config
  const apiKey = aiConfig.anthropic.apiKey;
  const newsApiKey = apiConfig.newsApi.apiKey;

  try {
    // Create the unified MCP server with all contexts
    const mcpServer = createUnifiedMcpServer({
      apiKey,
      newsApiKey,
      name: 'PersonalBrainMCP',
      version: '1.0.0',
      enableExternalSources: true,
    });
    
    // Create a transport that communicates via stdin/stdout
    const transport = new StdioServerTransport();
    
    // Add comprehensive error handling
    transport.onerror = (error) => {
      logger.error(`StdioServerTransport error: ${error}`);
      // Log the stack trace if available
      if (error instanceof Error && error.stack) {
        logger.error(`Error stack: ${error.stack}`);
      }
    };
    
    // Connect the MCP server to the transport
    // Note: connect() calls start() automatically, so we don't need to call start() ourselves
    mcpServer.connect(transport);
    
    logger.info('MCP Server started with stdio transport');
    logger.info('This server can be used with the MCP Inspector tool');
    
    // Set up error handler for uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught exception: ${error}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Error stack: ${error.stack}`);
      }
      // Don't exit, as we want to keep the server running if possible
    });
    
    // The server will now run indefinitely, handling messages via stdin/stdout
  } catch (error) {
    logger.error(`Error starting MCP server: ${error}`);
    // Log the stack trace if available
    if (error instanceof Error && error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run the main function
main();