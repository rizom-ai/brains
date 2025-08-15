# @brains/mcp

MCP transport layer implementation for Personal Brain applications.

## Overview

This package provides transport protocols (stdio and HTTP) for the Model Context Protocol server. It handles client connections, request routing, and transport-specific requirements like logging.

## Features

- **STDIO Transport**: For local process communication (Claude Desktop, VS Code)
- **HTTP Transport**: For web-based clients with SSE support
- **Transport-specific logging**: stderr for STDIO, console for HTTP
- **Session management**: For HTTP connections
- **Transport-based permissions**: Automatic permission level based on transport type

## Installation

```bash
bun add @brains/mcp
```

## Usage

### As an Interface Plugin

```typescript
import { MCPInterface } from "@brains/mcp";

// For STDIO transport
const stdioInterface = new MCPInterface({
  transport: "stdio",
});

// For HTTP transport
const httpInterface = new MCPInterface({
  transport: "http",
  httpPort: 3333,
});

// Register with shell
await shell.registerPlugin(stdioInterface);
```

### Transport Implementations

#### STDIO Transport

For command-line MCP clients:

```typescript
import { StdioMCPServer } from "@brains/mcp";

const stdioServer = StdioMCPServer.getInstance({
  logger: stderrLogger, // Must log to stderr
});

// Connect MCP server from core service
stdioServer.connectMCPServer(mcpServer);
await stdioServer.start();
```

#### HTTP Transport

For web-based MCP clients:

```typescript
import { StreamableHTTPServer } from "@brains/mcp";

const httpServer = StreamableHTTPServer.getInstance({
  port: 3333,
  host: "0.0.0.0",
  logger: consoleLogger,
});

// Connect MCP server from core service
httpServer.connectMCPServer(mcpServer);
await httpServer.start();
```

## Transport Logger

Special logging requirements for transports:

```typescript
// STDIO must use stderr (stdout is for protocol)
const stderrLogger = createStderrLogger();

// HTTP can use regular console
const consoleLogger = createConsoleLogger();

// Adapt existing logger
const transportLogger = adaptLogger(existingLogger);
```

## HTTP Endpoints

The HTTP transport provides these endpoints:

- `POST /mcp` - Initialize session and handle requests
- `GET /mcp` - SSE stream for notifications
- `DELETE /mcp` - Terminate session
- `GET /health` - Health check
- `GET /status` - Server status

## Session Management

HTTP transport manages client sessions:

```typescript
// Sessions are created on initialization
POST /mcp
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": { ... },
  "id": 1
}

// Response includes session ID
Headers: {
  "mcp-session-id": "uuid-here"
}

// Subsequent requests use session ID
POST /mcp
Headers: {
  "mcp-session-id": "uuid-here"
}
```

## Permissions

MCP uses transport-based permissions rather than user-based authentication:

- **STDIO Transport**: Automatically granted `anchor` level (local access)
- **HTTP Transport**: Defaults to `public` level (remote access)

Configure in your app's permission settings:

```typescript
import { defineConfig } from "@brains/app";

const config = defineConfig({
  permissions: {
    rules: [
      { pattern: "mcp:stdio", level: "anchor" }, // Local MCP
      { pattern: "mcp:http", level: "public" }, // Remote MCP
    ],
  },
});
```

## Configuration

### Plugin Configuration

```typescript
interface MCPConfig {
  transport: "stdio" | "http";
  httpPort?: number; // For HTTP transport
}
```

### Transport Configuration

```typescript
// STDIO config
interface StdioMCPServerConfig {
  logger?: TransportLogger;
}

// HTTP config
interface StreamableHTTPServerConfig {
  port?: number;
  host?: string;
  logger?: TransportLogger;
}
```

## Architecture

```
┌─────────────────────┐
│   MCP Client        │
│ (Claude, VS Code)   │
└──────────┬──────────┘
           │
    Protocol (stdio/HTTP)
           │
┌──────────▼──────────┐
│  Transport Layer    │
│   (this package)    │
├─────────────────────┤
│ • STDIO Server      │
│ • HTTP Server       │
│ • Session Mgmt      │
│ • Logging           │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   MCP Service       │
│  (shell/mcp-service)│
└─────────────────────┘
```

## Testing

```typescript
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp";

// Test STDIO transport
describe("StdioMCPServer", () => {
  const server = StdioMCPServer.createFresh();
  // ... tests
});

// Test HTTP transport
describe("StreamableHTTPServer", () => {
  const server = StreamableHTTPServer.createFresh({
    port: testPort,
  });
  // ... tests
});
```

## MCP Tools

The interface exposes MCP management tools:

- `mcp:status` - Get MCP server status
- `mcp:list-tools` - List registered tools
- `mcp:list-resources` - List registered resources

## Exports

- `MCPInterface` - Interface plugin class
- `StdioMCPServer` - STDIO transport implementation
- `StreamableHTTPServer` - HTTP transport implementation
- `TransportLogger` - Logger interface
- `createStderrLogger`, `createConsoleLogger` - Logger factories
- `adaptLogger` - Logger adapter

## License

MIT
