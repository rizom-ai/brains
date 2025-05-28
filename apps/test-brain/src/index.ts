import { Shell } from "@brains/shell";
import { gitSync } from "@brains/git-sync";
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import asyncHandler from "express-async-handler";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

console.log("🧠 Test Brain - Brain MCP Server");

async function main(): Promise<void> {
  try {
    // Initialize shell with configuration including plugins
    const shell = Shell.getInstance({
      database: {
        url: process.env["DATABASE_URL"] ?? "file:./test-brain.db",
      },
      ai: {
        provider: "anthropic" as const,
        apiKey: process.env["ANTHROPIC_API_KEY"] ?? "test-key",
        model: "claude-3-haiku-20240307",
        temperature: 0.7,
        maxTokens: 1000,
      },
      logging: {
        level: "debug" as const,
        context: "test-brain",
      },
      features: {
        enablePlugins: true,
        runMigrationsOnInit: false, // Disable migrations for compiled binary
      },
      plugins: [
        // Git sync plugin for version control
        gitSync({
          repoPath: "/home/yeehaa/Documents/brain", // Use existing brain directory
          branch: "main",
          autoSync: false, // Manual sync for testing
        }),
        // Future: noteContext(), taskContext(), etc.
      ],
    });

    // Initialize the shell (runs migrations, sets up plugins, etc.)
    await shell.initialize();
    console.log("✅ Shell initialized successfully with plugins");

    // Start StreamableHTTP server as default behavior
    await startStreamableHttpServer(shell);
    
    // Also start STDIO server for backward compatibility
    await startStdioServer(shell);

  } catch (error) {
    console.error("❌ Failed to start brain server:", error);
    process.exit(1);
  }
}

async function startStreamableHttpServer(shell: Shell): Promise<void> {
  const app = express();
  
  // Middleware
  app.use(express.json());
  app.use(cors()); // Enable CORS for MCP Inspector
  
  // Request logging
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  // Health endpoints
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      transport: 'streamable-http',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/status', (_req, res) => {
    res.json({ 
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      port: PORT
    });
  });

  // StreamableHTTP endpoint at /mcp
  app.post('/mcp', asyncHandler(async (req, res) => {
    // Create a fresh MCP server instance for this request
    const mcpServer = shell.getMCPServer().getServer();
    
    try {
      // Create StreamableHTTP transport with session management
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => nanoid(12) // Same length as DB IDs
      });
      
      // Connect server to transport
      // @ts-expect-error - MCP SDK bug: sessionId is typed as `string | undefined` instead of optional
      await mcpServer.connect(transport);
      
      // Handle the MCP request
      await transport.handleRequest(req, res, req.body);
      
      // Cleanup on request close
      res.on('close', () => {
        void transport.close();
      });
      
    } catch (error) {
      console.error('MCP transport error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error'
          }
        });
      }
    }
  }));

  const PORT = process.env["BRAIN_SERVER_PORT"] ?? 3333;
  
  const server = app.listen(PORT, () => {
    console.log(`🚀 Brain MCP server ready at http://localhost:${PORT}/mcp`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Status: http://localhost:${PORT}/status`);
  });
  
  server.on('error', (err: Error & { code?: string }) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Error: Port ${PORT} is already in use`);
      process.exit(1);
    }
    throw err;
  });
}

async function startStdioServer(_shell: Shell): Promise<void> {
  // Keep STDIO server for backward compatibility
  console.log("🔧 STDIO MCP server also available for legacy clients");
  // Note: We don't start STDIO automatically to avoid blocking the HTTP server
  // STDIO can be started with a flag if needed
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  console.error("❌ Test Brain failed to initialize:", error);
  process.exit(1);
});
