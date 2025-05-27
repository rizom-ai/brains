# StreamableHTTP Implementation Plan

## Overview

This document outlines the implementation plan for migrating from the deprecated HTTP+SSE transport to the new StreamableHTTP transport for our Brain MCP server, focusing on server mode implementation.

## Current Status

- **Deprecated**: HTTP+SSE transport (protocol version 2024-11-05)
- **New Standard**: StreamableHTTP transport
- **Target Port**: 3333 (avoiding conflicts with common development ports)
- **MCP Inspector**: Fully compatible with StreamableHTTP
- **Focus**: Server mode implementation first

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

## Implementation Plan

### Phase 1: Update test-brain Server Mode

**Location**: `apps/test-brain/`

**New Dependencies**:
```json
{
  "@modelcontextprotocol/sdk": "latest",
  "express": "^4.18.0"
}
```

**Server Mode Implementation**:

1. **Express Server Setup**
   ```typescript
   import express from "express";
   import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
   
   const app = express();
   app.use(express.json());
   
   const server = new McpServer({
     name: "brain-server",
     version: "1.0.0"
   });
   ```

2. **StreamableHTTP Endpoint**
   ```typescript
   app.all('/mcp', async (req, res) => {
     // StreamableHTTP transport handler
     // Integrate with existing Shell instance
   });
   
   app.listen(3333, () => {
     console.log('Brain MCP server listening on http://localhost:3333/mcp');
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

1. **Existing Tools Integration**
   - `brain_query` → Shell.executeQuery()
   - `brain_command` → Shell.executeCommand()
   - `entity_*` tools → EntityService methods

2. **Existing Resources Integration**
   - `entity://list` → EntityService.listEntities()
   - `entity://{id}` → EntityService.getEntity()
   - `schema://list` → SchemaRegistry.listSchemas()

3. **Session Isolation**
   - Each session gets own Shell context
   - Shared database, isolated state

### Phase 3: Testing & Validation

**MCP Inspector Testing**:
```bash
# Terminal 1: Start server
$ cd apps/test-brain && bun run dev --server

# MCP Inspector
URL: http://localhost:3333/mcp
Transport: StreamableHTTP
Status: Connected ✓
```

**Health Endpoints**:
```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', transport: 'streamable-http' });
});

app.get('/status', (req, res) => {
  res.json({ 
    sessions: sessions.size,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

## Implementation Details

### Mode Detection Update

```typescript
// src/index.ts
const args = process.argv.slice(2);

if (args.includes('--server')) {
  await runServerMode(); // New StreamableHTTP implementation
} else {
  // Existing standalone functionality unchanged
  await runStandaloneMode();
}
```

### Server Mode Implementation

```typescript
// src/modes/server.ts
export async function runServerMode() {
  const app = express();
  app.use(express.json());
  
  // Initialize Shell instance
  const shell = Shell.getInstance();
  await shell.initialize();
  
  // Setup MCP server with StreamableHTTP
  const mcpServer = new McpServer({
    name: "brain-server",
    version: "1.0.0"
  });
  
  // Register existing tools and resources
  await setupMcpTools(mcpServer, shell);
  await setupMcpResources(mcpServer, shell);
  
  // StreamableHTTP transport endpoint
  app.all('/mcp', createTransportHandler(mcpServer));
  
  // Health endpoints
  app.get('/health', healthHandler);
  app.get('/status', statusHandler);
  
  app.listen(3333, () => {
    console.log('Brain MCP server listening on http://localhost:3333/mcp');
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
        sessionId: req.headers['x-session-id'] as string,
        enableJsonResponse: false // Enable streaming
      });
      
      // Handle the MCP request
      await transport.handle(req, res, mcpServer);
      
    } catch (error) {
      console.error('MCP transport error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
```

## File Structure Updates

```
apps/test-brain/
├── src/
│   ├── index.ts            # Updated mode detection
│   ├── modes/
│   │   ├── server.ts       # New StreamableHTTP server mode
│   │   └── standalone.ts   # Existing standalone mode
│   ├── transport/
│   │   └── streamable.ts   # StreamableHTTP setup utilities
│   └── shell/
│       └── mcpIntegration.ts # MCP tools/resources setup
├── package.json            # Updated dependencies
└── README.md               # Updated usage instructions
```

## Configuration Management

### Environment Variables
```bash
# Server Configuration
BRAIN_SERVER_HOST=0.0.0.0
BRAIN_SERVER_PORT=3333
BRAIN_MCP_ENDPOINT=/mcp

# Database (unchanged)
DATABASE_URL=file:test-brain.db

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

### Usage Examples

```bash
# Server mode
$ cd apps/test-brain && bun run dev --server
# Brain MCP server listening on http://localhost:3333/mcp

# Standalone mode (unchanged)
$ cd apps/test-brain && bun run dev
# Existing behavior preserved
```

### MCP Inspector Integration

```json
// mcp-config.json (updated)
{
  "mcpServers": {
    "test-brain-streamable": {
      "url": "http://localhost:3333/mcp",
      "transport": "streamable-http"
    }
  }
}
```

## Testing Strategy

### Manual Testing
1. **Start Server**: `bun run dev --server`
2. **MCP Inspector**: Connect to `http://localhost:3333/mcp`
3. **Verify Tools**: Test `brain_query`, `entity_search`, etc.
4. **Verify Resources**: Test `entity://list`, `schema://list`
5. **Session Handling**: Multiple concurrent connections

### Automated Testing
```typescript
describe('StreamableHTTP Server', () => {
  test('should start on port 3333');
  test('should handle MCP requests');
  test('should integrate with Shell');
  test('should manage sessions');
});
```

## Migration Benefits

1. **Modern Transport**: Replace deprecated SSE with StreamableHTTP
2. **MCP Inspector Compatible**: Full debugging support
3. **Scalable**: Session-based state management  
4. **Infrastructure Friendly**: "Just HTTP"
5. **Backward Compatible**: Standalone mode unchanged

## Success Criteria

### Functional Requirements
- ✅ Server starts on port 3333 with `--server` flag
- ✅ StreamableHTTP transport working
- ✅ MCP Inspector can connect and test tools
- ✅ All existing MCP tools/resources functional
- ✅ Session management working
- ✅ Standalone mode unchanged

### Performance Requirements
- < 100ms response time for simple queries
- Support 5+ concurrent MCP Inspector sessions
- Graceful handling of connection drops
- Memory usage < 200MB for server mode

## Timeline

**Week 1**: 
- Add StreamableHTTP dependencies
- Implement basic server mode
- Test MCP Inspector connectivity

**Week 2**:
- Integrate existing Shell functionality
- Add session management
- Comprehensive testing

## Next Steps

1. Update `apps/test-brain/package.json` with `@modelcontextprotocol/sdk`
2. Implement server mode with StreamableHTTP transport on port 3333
3. Test connectivity with MCP Inspector
4. Verify all existing tools work via StreamableHTTP
5. Update README with new server mode usage