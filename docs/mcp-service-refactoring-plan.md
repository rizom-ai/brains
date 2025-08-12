# MCP Service Refactoring Plan

## Problem Statement

System plugin tools aren't showing up in MCP due to a timing issue:

- SystemPlugin registers before MCPInterface in the plugins array
- When SystemPlugin emits its tool registration events, MCP hasn't subscribed yet
- MCP only sees tools registered after it starts listening
- No persistent storage of tools/resources (unlike commands which have CommandRegistry)

## Architectural Analysis

### Current State

- **Commands**: Stored persistently in `CommandRegistry` (works perfectly)
- **Tools & Resources**: Event-only, no storage (fails with timing issues)
- **MCP Interface Plugin**: Handles both registration and transport

### Root Cause

The MCP SDK's `McpServer` already acts as a registry for tools and resources, but it's created inside an interface plugin that may initialize after other plugins have already emitted their capabilities.

## Solution: Split MCP into Service + Plugin

### Architecture Design

Split MCP functionality into two parts:

1. **MCPService (Shell Service)**: Handles tool/resource registration and MCP protocol
2. **MCPInterface (Plugin)**: Handles transport management only (stdio/http)

### Benefits

- **Guaranteed initialization order**: MCPService starts with Shell, before any plugins
- **Maximum code reuse**: ~80% of existing code stays unchanged
- **Clean separation of concerns**: Registration vs Transport
- **Consistency**: Aligns with CommandRegistry pattern (persistent storage)

## Implementation Plan

### Phase 1: Create MCPService

**Location**: `shell/mcp-service`

**Reused Components** (move from `interfaces/mcp`):

- `handlers/plugin-events.ts` → `mcp-service/src/handlers.ts`
  - `handleToolRegistration()` function
  - `handleResourceRegistration()` function
  - `setupSystemEventListeners()` adapted for shell context
- `utils/permissions.ts` → `mcp-service/src/permissions.ts`
  - Permission checking utilities

**New Components**:

```typescript
// shell/mcp-service/src/types.ts
export interface IMCPService {
  // Get the underlying MCP server for transport layers
  getMcpServer(): McpServer;

  // Registration methods (called internally via events)
  registerTool(pluginId: string, tool: PluginTool): void;
  registerResource(pluginId: string, resource: PluginResource): void;

  // Query methods
  listTools(): ToolInfo[];
  listResources(): ResourceInfo[];
}

// shell/mcp-service/src/mcp-service.ts
export class MCPService implements IMCPService {
  private static instance: MCPService | null = null;
  private mcpServer: McpServer;
  private messageBus: IMessageBus;
  private logger: Logger;

  constructor(messageBus: IMessageBus, logger: Logger) {
    this.mcpServer = new McpServer({ name: "brain-mcp", version: "1.0.0" });
    this.messageBus = messageBus;
    this.logger = logger.child("MCPService");
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Subscribe to tool registration events
    this.messageBus.subscribe("system:tool:register", (message) => {
      const { pluginId, tool } = message.payload;
      this.registerTool(pluginId, tool);
      return { success: true };
    });

    // Subscribe to resource registration events
    this.messageBus.subscribe("system:resource:register", (message) => {
      const { pluginId, resource } = message.payload;
      this.registerResource(pluginId, resource);
      return { success: true };
    });
  }

  // ... rest of implementation using reused code
}
```

### Phase 2: Update Shell

**File**: `shell/core/src/shell.ts`

**Changes**:

1. Import MCPService
2. Add to ShellDependencies interface
3. Initialize in constructor (before plugin manager)
4. Add `getMCPService()` method
5. Register in service registry

### Phase 3: Simplify MCPInterface Plugin

**File**: `interfaces/mcp/src/mcp-interface.ts`

**What to Remove**:

- McpServer creation
- Tool/resource registration event handling
- `handleToolRegistration()` and related functions

**What to Keep** (unchanged):

- Transport configuration (stdio vs http)
- `startServer()` / `stopServer()` methods
- Daemon lifecycle management
- StdioMCPServer and StreamableHTTPServer usage

**Key Change**:

```typescript
async onRegister(context: InterfacePluginContext) {
  // Get the MCP server from shell service instead of creating
  const mcpService = context.shell.getMCPService();
  this.mcpServer = mcpService.getMcpServer();

  // Rest stays the same - transport management
}
```

### Phase 4: Testing

1. Verify SystemPlugin tools appear in MCP
2. Test both stdio and http transports
3. Test with different plugin initialization orders
4. Verify existing commands still work

## File Structure After Refactoring

```
shell/
  mcp-service/            # NEW
    src/
      mcp-service.ts      # Main service class
      handlers.ts         # Moved from interfaces/mcp
      permissions.ts      # Moved from interfaces/mcp
      types.ts           # Service interface
      index.ts           # Exports
    package.json

interfaces/
  mcp/                    # SIMPLIFIED
    src/
      mcp-interface.ts    # Transport only
      config.ts          # Keep as-is
      tools/             # Keep MCP's own tools
      types.ts           # Keep transport types
```

## Migration Checklist

- [ ] Create shell/mcp-service package structure
- [ ] Move handler functions to mcp-service
- [ ] Move permission utilities to mcp-service
- [ ] Implement MCPService class
- [ ] Update Shell to include MCPService
- [ ] Update IShell interface
- [ ] Simplify MCPInterface plugin
- [ ] Update tests
- [ ] Test with SystemPlugin
- [ ] Update documentation

## Risk Mitigation

- **Backward Compatibility**: The external MCP interface remains unchanged
- **Gradual Migration**: Can be done in stages without breaking existing functionality
- **Testing**: Each phase can be tested independently

## Success Criteria

1. SystemPlugin tools appear in MCP regardless of registration order
2. All existing MCP functionality continues to work
3. Code duplication is minimized (>80% code reuse)
4. Architecture is consistent with other shell services
