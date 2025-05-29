import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { aiConfig, apiConfig, serverConfig } from './config';
import { createUnifiedMcpServer } from './mcpServer';
import type { McpServer as ExtendedMcpServer } from './mcpServer';
import { HeartbeatSSETransport } from './transport';
import logger from './utils/logger';



// A mapping of session IDs to their transports
const transports: { [key: string]: HeartbeatSSETransport } = {};

// Start the HTTP server
export function startMcpHttpServer() {
  const app = express();
  const PORT = serverConfig.mcpHttpPort;

  try {
    // Configure CORS middleware
    app.use((req: Request, res: Response, next: NextFunction): void => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
    
    // Create the unified MCP server
    const mcpServer = createUnifiedMcpServer({
      apiKey: aiConfig.anthropic.apiKey,
      newsApiKey: apiConfig.newsApi.apiKey,
      name: 'PersonalBrainMCP',
      version: '1.0.0',
      enableExternalSources: true,
    });

    // Basic MCP info endpoint
    app.get('/mcp', (_req, res) => {
      res.json({
        name: 'PersonalBrainMCP',
        version: '1.0.0',
        resources: [],
        tools: [],
      });
    });

    // SSE endpoints
    app.get('/sse', (req: Request, res: Response): void => {
      void setupSseTransport(req, res, mcpServer as unknown as ExtendedMcpServer);
    });
    
    app.get('/mcp/sse', (req: Request, res: Response): void => {
      void setupSseTransport(req, res, mcpServer as unknown as ExtendedMcpServer);
    });

    // Messages endpoint
    app.post('/messages', async (req: Request, res: Response): Promise<void> => {
      const sessionId = req.query['sessionId'] as string;

      if (!sessionId) {
        res.status(400).json({ error: 'No sessionId provided' });
        return;
      }

      const transport = transports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(404).json({ error: 'No active transport found for this session' });
      }
    });

    // Start the server
    const server = app.listen(PORT, () => {
      logger.info(`MCP HTTP server running at http://localhost:${PORT}`);
      logger.info('Available endpoints:');
      logger.info(`- Server info: http://localhost:${PORT}/mcp`);
      logger.info(`- SSE endpoint (standard): http://localhost:${PORT}/sse`);
      logger.info(`- SSE endpoint (MCP Inspector): http://localhost:${PORT}/mcp/sse`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Shutting down MCP HTTP server...');
      Object.values(transports).forEach(transport => void transport.close());
      server.close();
      process.exit(0);
    });

    return server;
  } catch (error) {
    logger.error(`Error starting MCP server: ${error}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Set up SSE transport for a connection
async function setupSseTransport(req: Request, res: Response, mcpServer: ExtendedMcpServer): Promise<void> {
  // Socket optimizations
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  
  // Add custom header for buffering (not part of standard transport)
  res.setHeader('X-Accel-Buffering', 'no'); 

  // Create and store the transport using the getInstance pattern
  const transport = HeartbeatSSETransport.createFresh({
    messagesEndpoint: '/messages',
    res,
    heartbeatIntervalMs: 30000, // Use default heartbeat interval
  });
  
  // Get the session ID safely with bracket notation
  const sessionId = transport.getSessionId();
  transports[sessionId] = transport;

  logger.info(`SSE connection established with session ID: ${sessionId}`);

  // Clean up on connection close
  res.on('close', () => {
    delete transports[sessionId];
    logger.info(`SSE connection closed: ${sessionId}`);
  });

  // Send connection_ready event before connecting
  transport.sendCustomEvent('connection_ready', {
    type: 'connection_ready',
    transportType: 'sse',
    sessionId,
    serverName: 'PersonalBrainMCP',
    serverVersion: '1.0.0',
    timestamp: new Date().toISOString(),
  });

  // Connect the transport to the MCP server (this will call start() automatically)
  await mcpServer.connect(transport as unknown as Transport);
}

// Auto-start the server when this module is loaded directly
if (require.main === module) {
  startMcpHttpServer();
}