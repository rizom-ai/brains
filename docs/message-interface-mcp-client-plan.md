# Message Interface Package with MCP Client Support

## Overview

This plan outlines the extraction of message interface functionality from `@brains/plugin-utils` into a dedicated `@brains/message-interface` package, with built-in MCP (Model Context Protocol) client capabilities. This will enable AI-powered tool discovery and execution across all interfaces (CLI, Matrix, future Web UI).

## Motivation

1. **Original Design Intent**: The system was designed for AI to have access to tools when processing queries
2. **Clean Architecture**: Message interfaces deserve their own package separate from generic plugin utilities
3. **Unified Tool Access**: All interfaces should connect as MCP clients to the Shell's MCP server
4. **Natural Language Tool Execution**: Users can discover and execute tools through conversation

## Current State

- Message interfaces (CLI, Matrix) directly use Shell via PluginContext
- Tools are registered but not accessible to AI during query processing
- MCP server exists but only serves external clients
- Each interface has different permission levels (CLI=anchor, Matrix=per-user)

## Proposed Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     CLI     │     │   Matrix    │     │   Web UI    │
│ MCP Client  │     │ MCP Client  │     │ MCP Client  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       └────────────────────┴────────────────────┘
                            │
                    HTTP + SSE (localhost:3000)
                            │
                   ┌────────┴────────┐
                   │  MCP Interface  │
                   │  (HTTP Server)  │
                   ├─────────────────┤
                   │     Shell       │
                   │                 │
                   │ • Tools         │
                   │ • Entities      │
                   │ • Permissions   │
                   └─────────────────┘
```

## Implementation Plan

### Phase 1: Create Message Interface Package

#### Package Structure

```
shared/message-interface/
├── package.json
├── src/
│   ├── index.ts
│   ├── base/
│   │   ├── message-interface-plugin.ts  (moved from plugin-utils)
│   │   └── types.ts                     (MessageContext, Command, etc.)
│   ├── mcp/
│   │   ├── mcp-client-helper.ts        (MCP client functionality)
│   │   ├── mcp-client-interface.ts     (MCP-based interface class)
│   │   └── types.ts                    (MCPSession, etc.)
│   └── utils/
│       ├── command-parser.ts
│       └── progress-handler.ts
└── test/
```

#### Key Components

1. **MCPClientHelper** - Handles MCP connection, session management, and tool execution
2. **Enhanced MessageInterfacePlugin** - Supports both MCP and local modes
3. **MCPClientInterface** - Pure MCP client base class for interfaces

### Phase 2: MCP Client Implementation

#### MCP Client Helper

```typescript
export class MCPClientHelper {
  private client: MCPClient;
  private session: MCPSession;
  private eventSource?: EventSource;

  async connect(permission: UserPermissionLevel): Promise<void> {
    // Create session with permission level
    this.session = await this.createSession(permission);

    // Connect MCP client with session
    this.client = new MCPClient({
      transport: "http",
      endpoint: "http://localhost:3000/mcp",
      headers: { "X-Session-ID": this.session.id },
    });

    // Setup SSE for progress streaming
    this.setupProgressStream();
  }

  async processMessage(
    message: string,
    context: MessageContext,
  ): Promise<MessageResponse> {
    // Use MCP tool for AI-powered message processing
    return this.client.callTool("shell:process-message", {
      message,
      context,
      sessionId: this.session.id,
    });
  }
}
```

### Phase 3: Server-Side MCP Enhancements

1. **Session Management**
   - Add session tracking to MCP interface
   - Map sessions to permission levels
   - Handle multiple concurrent clients

2. **New MCP Tools**

   ```typescript
   'shell:process-message' - AI processes message with tool awareness
   'shell:list-available-tools' - Get tools for permission level
   'interface:get-session' - Create/retrieve interface session
   ```

3. **Progress Streaming**
   - SSE endpoint: `/mcp/events/:sessionId`
   - Route progress events by session
   - Support for batch operations

### Phase 4: Interface Migration Strategy

#### Gradual Adoption Path

1. **Stage 1: Package Migration** (No behavior change)

   ```typescript
   // Before
   import { MessageInterfacePlugin } from "@brains/plugin-utils";

   // After
   import { MessageInterfacePlugin } from "@brains/message-interface";
   ```

2. **Stage 2: MCP with Fallback**

   ```typescript
   export class CLIInterface extends MessageInterfacePlugin {
     protected mcpConfig = {
       enabled: true,
       fallbackToLocal: true,
     };
   }
   ```

3. **Stage 3: Full MCP Mode**
   ```typescript
   export class CLIInterface extends MCPClientInterface {
     getPermissionLevel(): UserPermissionLevel {
       return "anchor";
     }
   }
   ```

### Phase 5: AI Tool Integration

The AI service will receive available tools and can execute them naturally:

```typescript
// User: "Can you generate content for all pages?"
// AI sees available tools including 'site-builder:generate-all'
// AI executes tool and returns: "I'll generate content for all pages. This has been queued..."
```

## Benefits

1. **Clean Separation of Concerns**
   - Message interfaces in dedicated package
   - MCP client logic properly encapsulated
   - Plugin-utils remains focused on core plugin functionality

2. **Unified Architecture**
   - All interfaces connect the same way
   - Consistent tool access patterns
   - Single source of truth (MCP server)

3. **Enhanced User Experience**
   - Natural language tool discovery
   - AI can execute tools on user's behalf
   - Consistent behavior across interfaces

4. **Future-Proof Design**
   - Ready for web interfaces
   - Supports new connection modes
   - Clean API for extensions

## Migration Timeline

1. **Week 1-2**: Create package, move existing code
2. **Week 3-4**: Implement MCP client helper
3. **Week 5-6**: Add server-side MCP tools
4. **Week 7-8**: Migrate CLI to MCP mode
5. **Week 9-10**: Migrate Matrix, test extensively
6. **Week 11-12**: Documentation and cleanup

## Success Criteria

- [ ] Message interface package created and published
- [ ] MCP client helper fully functional
- [ ] CLI can execute tools via AI naturally
- [ ] Matrix respects per-user permissions
- [ ] Progress streaming works across interfaces
- [ ] All tests passing with new architecture

## Open Questions

1. Should we support WebSocket transport for real-time updates?
2. How do we handle offline/degraded MCP server scenarios?
3. Should command parsing remain in interfaces or move to server?

## Related Documents

- Progress Notification Enhancement Plan
- Permission System Implementation
- Plugin System Architecture
