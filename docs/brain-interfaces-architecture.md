# Brain Interfaces Architecture

## Overview

This document outlines the architecture for connecting multiple interfaces (CLI, Matrix bot, etc.) to a single Brain instance via the MCP server.

## Core Principle

**Single Brain, Multiple Interfaces**: All interfaces connect to the same MCP server instance via HTTP/SSE transport to ensure a unified brain with shared state.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   CLI App   │     │  Matrix Bot  │     │  Future Apps    │
│  (brain)    │     │              │     │  (Web UI, etc)  │
└──────┬──────┘     └──────┬───────┘     └────────┬────────┘
       │                   │                       │
       │ HTTP/SSE          │ HTTP/SSE             │ HTTP/SSE
       │                   │                       │
       └───────────────────┴───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ MCP Server  │
                    │  (HTTP/SSE) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Shell     │
                    │   (Brain)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Database   │
                    │  (libSQL)    │
                    └─────────────┘
```

## Components

### 1. MCP Server (HTTP/SSE Mode)

**Location**: `apps/brain-server` (new)

**Responsibilities**:
- Run as a daemon/service
- Expose MCP protocol over HTTP/SSE
- Handle authentication (future)
- Manage single Shell/Brain instance
- Support multiple concurrent clients

**Key Features**:
- HTTP endpoint for JSON-RPC calls
- SSE endpoint for streaming responses
- Health check endpoint
- Metrics endpoint (future)

**Configuration**:
```yaml
server:
  host: 0.0.0.0
  port: 8080
  transport: http-sse
  
brain:
  database: 
    url: "${DATABASE_URL}"
  plugins:
    - git-sync
    - note-context
```

### 2. CLI Application

**Location**: `apps/brain-cli` (new)

**Responsibilities**:
- Interactive REPL interface
- Single command execution
- Connect to MCP server via HTTP

**Key Features**:
- Natural language queries
- Entity management commands
- Configuration management
- Output formatting (json, table, markdown)

**Usage Modes**:
```bash
# Interactive REPL
$ brain
brain> What did I learn about TypeScript yesterday?
...

# Single command
$ brain query "What are my open tasks?"

# Entity operations
$ brain create note "Meeting notes..."
$ brain search --type task --tag urgent
```

### 3. Matrix Bot

**Location**: `apps/matrix-bot` (new)

**Responsibilities**:
- Connect to Matrix homeserver
- Handle user messages
- Forward queries to MCP server
- Format responses for Matrix

**Key Features**:
- Multi-user support
- Room-based conversations
- Command parsing
- Rich message formatting

## Implementation Plan

### Phase 1: MCP HTTP Server
1. Create `brain-server` app
2. Implement HTTP/SSE transport for MCP
3. Add health/status endpoints
4. Add systemd service file

### Phase 2: Update Existing Code
1. Modify test-brain to support HTTP client mode
2. Extract MCP server setup to brain-server
3. Add HTTP client utilities

### Phase 3: CLI Application
1. Create brain-cli app
2. Implement MCP HTTP client
3. Add REPL interface
4. Add command parsing
5. Add output formatting

### Phase 4: Matrix Bot
1. Create matrix-bot app
2. Implement Matrix SDK integration
3. Add message handling
4. Connect to MCP server

## Deployment Considerations

### Development
```bash
# Start server
$ cd apps/brain-server && bun run dev

# In another terminal, use CLI
$ cd apps/brain-cli && bun run dev
```

### Production
```bash
# Install as systemd service
$ sudo cp brain-server.service /etc/systemd/system/
$ sudo systemctl enable brain-server
$ sudo systemctl start brain-server

# CLI connects to running service
$ brain query "..."
```

## Security Considerations

### Authentication
- Initial version: No auth (localhost only)
- Future: Bearer token authentication
- Per-user access control (future)

### Transport Security
- Development: HTTP (localhost only)
- Production: HTTPS with proper certificates
- Rate limiting per client

## Benefits of This Architecture

1. **Shared State**: All interfaces see the same data
2. **Scalability**: Can add more interfaces without changing core
3. **Flexibility**: Interfaces can be on different machines
4. **Maintainability**: Clear separation of concerns
5. **Testability**: Each component can be tested independently

## Alternatives Considered

### STDIO Spawning (Rejected)
- Each client spawns its own MCP server
- ❌ No shared state
- ❌ Resource intensive
- ❌ Database conflicts

### Direct Shell Integration (Rejected)
- Each app imports Shell directly
- ❌ Tight coupling
- ❌ No remote access
- ❌ Harder to maintain

### WebSocket Transport (Future)
- Could replace SSE for bidirectional streaming
- Better for real-time updates
- Consider for v2

## Next Steps

1. Review and approve this architecture
2. Create brain-server app with HTTP/SSE MCP transport
3. Update test-brain to test HTTP client mode
4. Begin CLI app development
5. Plan Matrix bot features