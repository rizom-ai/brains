# @brains/mcp

MCP transport layer implementation for Brain applications.

## Overview

This package provides transport protocols (stdio and HTTP) for the Model Context Protocol server. It handles client connections, request routing, and transport-specific requirements like logging.

## Features

- **STDIO Transport**: For local process communication (Claude Desktop, VS Code)
- **HTTP Transport**: For web-based clients with SSE support
- **Transport-specific logging**: stderr for STDIO, console for HTTP
- **Session management**: For HTTP connections
- **Transport-based permissions**: Automatic permission level based on transport type
- **Conversational basic mode**: Reads and mutations route through agent-backed `mcp_chat`/`mcp_confirm`; raw tools default to debug-only

## Installation

```bash
bun add @brains/mcp
```

## Usage

### As an installed interface

The package exports a declarative interface, not a plugin class. Configure the
installed `mcp` member in `brain.yaml`:

```yaml
plugins:
  mcp:
    transport: http
    mode: basic
    authToken: ${MCP_AUTH_TOKEN}
```

Use `transport: stdio` for local process clients. Basic mode exposes only
`mcp_chat` and `mcp_confirm`.

### Protocol registration without a transport host

The MCP declaration supplies the bounded `protocol` selector on `defineInterface`.
It receives validated configuration only and returns a mode and tool definitions.
The native installed instance implements `ProtocolPluginProvider`; its
`createProtocolPlugin()` returns a fresh registration with the same installed
package/plugin identity and mode, using the shared `mcp_chat`/`mcp_confirm`
handlers. Host configuration, setup, routes, endpoint advertisements and listener
daemons are not carried over. Install either the hosted interface or its protocol
registration, not both under the same `@brains/mcp:mcp` identity.

The embedding connects SDK transports to permission-scoped servers created by the
shell's MCP service. It owns connection cleanup and must supply trusted caller
context; protocol-only registration is not an authentication bypass for remote
clients. Hosted HTTP still uses the runtime HTTP host and retains its authentication
and Admin-gated debug-mode checks.

The evaluator uses this registration path for `--mcp-basic`. It does not change
transport configuration, restore a production host, or open stdio. From
`packages/brain-cli`, run the protocol-specific regression with:

```bash
bun run eval:personal --mcp-basic --test mcp-long-note-update --skip-llm-judge
```

Protocol evals assert what MCP actually exposes. A confirmation contains the
pending action and summary, not the agent's internal read-call trace. The
long-note protocol case checks exact pending edits, unchanged storage after
cancellation, and exact saved content and metadata after approval. In-memory
protocol evals do not cover HTTP authentication, proxy deadlines, or Cloudflare.

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

- `POST /mcp` - Handle stateless MCP requests for both 2026-07-28 and legacy clients
- `GET /mcp` - Reserved for protocol streams; legacy session requests return `405`
- `DELETE /mcp` - Legacy session termination requests return `405`
- `GET /health` - Health check
- `GET /status` - Server status

## Stateless HTTP

HTTP requests carry their own protocol and authentication context. The server
verifies the bearer on every request and builds a fresh permission-scoped MCP
server from the live registry. There are no MCP session IDs, in-memory session
maps, or idle-session settings. The SDK's default stateless legacy path keeps
pre-2026 clients working without retaining server-side session state.

### Silent requests and keepalives

Modern HTTP exchanges use the SDK's `responseMode: "sse"`, so its default
15-second keepalive comments cover silent work such as model generation. In
`auto` mode, streaming would not start until a result or progress notification;
that initial silence can exceed a reverse proxy's response-header deadline.

This is an SSE response within **Streamable HTTP**, not the older HTTP+SSE
transport or a new session protocol. The SDK owns framing, keepalives, and
cleanup. Request authentication still precedes streaming, cancellation and
shutdown abort active modern handlers, and stateless legacy serving is unchanged.
Keepalives do not shorten model execution or remove client/hard request deadlines.

## Permissions

MCP uses transport-based permissions rather than user-based authentication:

- **STDIO Transport**: Uses the configured `admin` level for local access
- **HTTP Transport**: Defaults to `public` level (remote access)
- **Authenticated HTTP**: Resolves each bearer/OAuth caller's `admin`, `trusted`, or `public` level

Configure in your app's permission settings:

```typescript
import { defineConfig } from "@brains/app";

const config = defineConfig({
  permissions: {
    rules: [
      { pattern: "mcp:stdio", level: "admin" }, // Local MCP
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
  mode?: "basic" | "debug"; // default: "basic"
  httpPort?: number; // For HTTP transport
  authToken?: string; // Bearer token for HTTP transport
}
```

`basic` mode is the default and is suitable for remote callers. Its built-in
conversational adapters use these protocol names:

- `mcp_chat` — routes commands/reasoned requests through the brain agent
- `mcp_confirm` — resolves pending confirmations returned by `mcp_chat`

Every request — reads included — goes through `mcp_chat` so the brain's system
prompt, context, permissions, and confirmation flow stay in the loop. Successful
`mcp_chat`/`mcp_confirm` responses include the agent text and may include `toolResults`
and `readYourWrites` handles with entity IDs and job IDs. In basic mode, ask
through `mcp_chat` to retrieve or poll those results. For non-public saves, ask for
team/shared visibility or private/Admin-only
visibility explicitly; the agent maps those requests to the canonical
`system_create.visibility` field while basic mode continues to hide raw tools.

`debug` mode preserves raw tool exposure for local inspection. It requires
`admin` permissions and is refused for unauthenticated HTTP transport.

```typescript
const debugStdio = new MCPInterface({
  transport: "stdio",
  mode: "debug",
});

const debugHttp = new MCPInterface({
  transport: "http",
  mode: "debug",
  authToken: process.env.MCP_AUTH_TOKEN,
});
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

In `basic` mode, the interface exposes its conversational tools:

- `mcp_chat` - Route commands and reasoned requests through the brain agent
- `mcp_confirm` - Confirm or deny a pending action returned by `mcp_chat`

Ordinary tools — reads and writes alike — default to debug-only unless explicitly
opted into basic exposure. Agent availability is independent of direct exposure. Use
`debug` mode only for local/operator inspection when you intentionally need raw
tool access (raw reads such as `system_search`, `system_get`, `system_list`, and
`system_job_status` included).

## Exports

- `MCPInterface` - Interface plugin class
- `StdioMCPServer` - STDIO transport implementation
- `StreamableHTTPServer` - HTTP transport implementation
- `TransportLogger` - Logger interface
- `createStderrLogger`, `createConsoleLogger` - Logger factories
- `adaptLogger` - Logger adapter

## License

AGPL-3.0-only
