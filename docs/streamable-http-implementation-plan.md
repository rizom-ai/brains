# StreamableHTTP Implementation Plan

## Overview

This document outlines the implementation plan for migrating `test-brain` from the deprecated HTTP+SSE transport to the new StreamableHTTP transport, transforming it into a self-contained MCP brain server.

## Design Decisions

- **Architecture**: Self-contained MCP server (no client/server split)
- **Default Behavior**: Starts StreamableHTTP server immediately on port 3333
- **Transport**: Official `@modelcontextprotocol/sdk` with stateful sessions
- **Framework**: Express.js with `/mcp` endpoint
- **Compatibility**: Preserve all existing MCP tools/resources + STDIO transport
- **Configuration**: Runtime environment variables, existing mcp-config.json format
- **Operations**: Health endpoints, graceful shutdown, startup logging
- **Error Handling**: Clear error on port conflicts (no auto-retry)
- **Web Support**: CORS headers for MCP Inspector
- **Monitoring**: Basic request logging

## Current Status

- **Deprecated**: HTTP+SSE transport (protocol version 2024-11-05)
- **New Standard**: StreamableHTTP transport
- **Target Port**: 3333 (avoiding conflicts with common development ports)
- **MCP Inspector**: Fully compatible with StreamableHTTP

## Implementation Architecture

### Server Configuration

```yaml
server:
  host: 0.0.0.0
  port: 3333
  transport: streamable-http
  endpoint: /mcp

brain:
  database:
    url: "${DATABASE_URL}"
  plugins:
    - git-sync
    - note-context
```

### Technology Stack

- **SDK**: `@modelcontextprotocol/sdk` (TypeScript)
- **Transport**: `StreamableHTTPServerTransport`
- **Session Management**: Stateful with session ID tracking
- **Framework**: Express.js for HTTP server
- **CORS**: Enabled for web-based MCP tools
- **Logging**: Basic request logging with timestamps

## Implementation Plan

### Phase 1: Core StreamableHTTP Server

**Location**: `apps/test-brain/`

**New Dependencies**:

```json
{
  "@modelcontextprotocol/sdk": "latest",
  "express": "^4.18.0",
  "cors": "^2.8.5"
}
```

**Default Server Implementation**:

1. **Express Server Setup**

   ```typescript
   import express from "express";
   import cors from "cors";
   import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

   const app = express();
   app.use(express.json());
   app.use(cors()); // Enable CORS for MCP Inspector

   // Request logging
   app.use((req, res, next) => {
     console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
     next();
   });

   const server = new McpServer({
     name: "test-brain",
     version: "1.0.0",
   });
   ```

2. **StreamableHTTP Endpoint**

   ```typescript
   app.all("/mcp", async (req, res) => {
     // StreamableHTTP transport handler
     // Integrate with existing Shell instance
   });

   const PORT = process.env.BRAIN_SERVER_PORT || 3333;
   app
     .listen(PORT, () => {
       console.log(`Brain MCP server ready at http://localhost:${PORT}/mcp`);
     })
     .on("error", (err: any) => {
       if (err.code === "EADDRINUSE") {
         console.error(`Error: Port ${PORT} is already in use`);
         process.exit(1);
       }
       throw err;
     });
   ```

3. **Session Management**

   ```typescript
   interface SessionContext {
     sessionId: string;
     transport: StreamableHTTPServerTransport;
     shell: Shell;
     lastActivity: Date;
   }

   const sessions: Map<string, SessionContext> = new Map();
   ```

### Phase 2: Shell Integration

**Integration Points**:

1. **Existing Tools Integration** (unchanged)

   - `brain_query` → Shell.executeQuery()
   - `brain_command` → Shell.executeCommand()
   - `entity_*` tools → EntityService methods

2. **Existing Resources Integration** (unchanged)

   - `entity://list` → EntityService.listEntities()
   - `entity://{id}` → EntityService.getEntity()
   - `schema://list` → SchemaRegistry.listSchemas()

3. **Transport Compatibility**
   - Keep existing STDIO transport alongside StreamableHTTP
   - Same MCP tools/resources work on both transports

### Phase 3: Health & Monitoring

**Health Endpoints**:

```typescript
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    transport: "streamable-http",
    timestamp: new Date().toISOString(),
  });
});

app.get("/status", (req, res) => {
  res.json({
    sessions: sessions.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    port: PORT,
  });
});
```

**Graceful Shutdown**:

```typescript
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  // Clean up sessions, close DB connections
  await cleanup();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  await cleanup();
  process.exit(0);
});
```

## Implementation Details

### Main Entry Point

```typescript
// src/index.ts - Always start as server by default
export async function main() {
  try {
    // Initialize Shell instance
    const shell = Shell.getInstance();
    await shell.initialize();

    // Start StreamableHTTP server
    await startMcpServer(shell);

    // Keep STDIO transport for backward compatibility
    await startStdioServer(shell);
  } catch (error) {
    console.error("Failed to start brain server:", error);
    process.exit(1);
  }
}

main();
```

### StreamableHTTP Server Implementation

```typescript
// src/server/streamableHttp.ts
export async function startMcpServer(shell: Shell) {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  const mcpServer = new McpServer({
    name: "test-brain",
    version: "1.0.0",
  });

  // Register existing tools and resources (unchanged)
  await setupMcpTools(mcpServer, shell);
  await setupMcpResources(mcpServer, shell);

  // StreamableHTTP transport endpoint
  app.all("/mcp", createTransportHandler(mcpServer));

  // Health endpoints
  app.get("/health", healthHandler);
  app.get("/status", statusHandler);

  const PORT = process.env.BRAIN_SERVER_PORT || 3333;

  return new Promise((resolve, reject) => {
    const server = app
      .listen(PORT, () => {
        console.log(`Brain MCP server ready at http://localhost:${PORT}/mcp`);
        resolve(server);
      })
      .on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          console.error(`Error: Port ${PORT} is already in use`);
          process.exit(1);
        }
        reject(err);
      });
  });
}
```

### Transport Handler

```typescript
function createTransportHandler(mcpServer: McpServer) {
  const sessions = new Map<string, SessionContext>();

  return async (req: Request, res: Response) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionId: req.headers["x-session-id"] as string,
        enableJsonResponse: false, // Enable streaming
      });

      // Handle the MCP request
      await transport.handle(req, res, mcpServer);
    } catch (error) {
      console.error("MCP transport error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
```

## File Structure Updates

```
apps/test-brain/
├── src/
│   ├── index.ts            # Main entry point (always starts server)
│   ├── server/
│   │   ├── streamableHttp.ts # StreamableHTTP server implementation
│   │   └── stdio.ts        # Existing STDIO server (unchanged)
│   ├── transport/
│   │   └── handlers.ts     # Transport handler utilities
│   └── shell/
│       └── mcpIntegration.ts # MCP tools/resources setup (unchanged)
├── package.json            # Updated dependencies
├── mcp-config.json         # Updated for StreamableHTTP
└── README.md               # Updated usage instructions
```

## Configuration Management

### Environment Variables

```bash
# Server Configuration
BRAIN_SERVER_HOST=0.0.0.0
BRAIN_SERVER_PORT=3333

# Database (unchanged)
DATABASE_URL=file:test-brain.db

# API Keys (unchanged)
ANTHROPIC_API_KEY=your-key-here

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

### Usage Examples

```bash
# Default behavior - starts server immediately
$ cd apps/test-brain && bun run dev
# Brain MCP server ready at http://localhost:3333/mcp

# Production binary
$ ./dist/test-brain
# Brain MCP server ready at http://localhost:3333/mcp

# Custom port
$ BRAIN_SERVER_PORT=4444 ./dist/test-brain
# Brain MCP server ready at http://localhost:4444/mcp
```

### MCP Inspector Integration

```json
// mcp-config.json (updated)
{
  "mcpServers": {
    "test-brain": {
      "url": "http://localhost:3333/mcp",
      "transport": "streamable-http"
    }
  }
}
```

## Testing Strategy

### Manual Testing

1. **Start Server**: `bun run dev`
2. **MCP Inspector**: Connect to `http://localhost:3333/mcp`
3. **Verify Tools**: Test `brain_query`, `entity_search`, etc.
4. **Verify Resources**: Test `entity://list`, `schema://list`
5. **Health Check**: `curl http://localhost:3333/health`
6. **Session Handling**: Multiple concurrent MCP Inspector connections

### Automated Testing

```typescript
describe("StreamableHTTP Server", () => {
  test("should start on port 3333");
  test("should handle MCP requests");
  test("should integrate with Shell");
  test("should manage sessions");
  test("should serve health endpoints");
  test("should handle graceful shutdown");
});
```

## Migration Benefits

1. **Modern Transport**: Replace deprecated SSE with StreamableHTTP
2. **Self-Contained**: No client/server complexity
3. **MCP Inspector Compatible**: Full debugging support
4. **Web-Friendly**: CORS enabled for browser tools
5. **Production Ready**: Health checks, logging, graceful shutdown
6. **Backward Compatible**: STDIO transport preserved

## Success Criteria

### Functional Requirements

- ✅ Server starts immediately by default on port 3333
- ✅ StreamableHTTP transport working
- ✅ MCP Inspector can connect and test tools
- ✅ All existing MCP tools/resources functional
- ✅ Session management working
- ✅ STDIO transport still available
- ✅ Health endpoints responding
- ✅ Graceful shutdown working

### Performance Requirements

- < 100ms response time for simple queries
- Support 10+ concurrent MCP Inspector sessions
- Graceful handling of connection drops
- Memory usage < 300MB for server mode

## Timeline

**Week 1**:

- Add StreamableHTTP dependencies
- Implement basic server with health endpoints
- Test MCP Inspector connectivity

**Week 2**:

- Integrate existing Shell functionality
- Add session management and logging
- Comprehensive testing and documentation

## Next Steps

1. Update `apps/test-brain/package.json` with new dependencies
2. Implement StreamableHTTP server as default behavior
3. Test connectivity with MCP Inspector on port 3333
4. Verify all existing tools work via StreamableHTTP
5. Update README with new usage instructions
