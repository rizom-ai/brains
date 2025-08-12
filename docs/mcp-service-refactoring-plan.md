# MCP Service Refactoring Plan

## Key Change: Direct Registration Instead of Events

**Before**: PluginManager → Events → CommandRegistry/MCP (timing issues)  
**After**: PluginManager → Direct method calls → CommandRegistry/MCPService (no timing issues)

This eliminates the MessageBus for capability registration since:

- Only one consumer per event type (no other plugins listen)
- Consumers will be shell services (guaranteed to exist)
- Direct registration is simpler and more maintainable

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

## Solution: Direct Registration with Shell Services

### Architecture Design

1. **Move to Direct Registration**: Eliminate MessageBus for capability registration
   - PluginManager directly calls registry methods
   - No events, no timing issues, simpler flow

2. **Create MCPService as Shell Service**:
   - Handles tool/resource registration and MCP protocol
   - Initialized before any plugins (like CommandRegistry)

3. **Simplify MCPInterface Plugin**:
   - Only handles transport management (stdio/http)
   - Gets McpServer instance from MCPService

### Benefits

- **Simpler architecture**: No unnecessary event indirection
- **Guaranteed initialization order**: Services start before plugins
- **Maximum code reuse**: ~70% of existing MCP code stays unchanged
- **Consistency**: All registries work the same way (direct registration)
- **Easier to understand**: Direct method calls instead of events

## Implementation Plan

### Phase 1: Create MCPService

**Location**: `shell/mcp-service`

**Reused Components** (move from `interfaces/mcp`):

- `handlers/plugin-events.ts` → `mcp-service/src/handlers.ts`
  - Extract core logic from `handleToolRegistration()`
  - Extract core logic from `handleResourceRegistration()`
  - Remove event subscription code (not needed with direct registration)
- `utils/permissions.ts` → `mcp-service/src/permissions.ts`
  - Permission checking utilities

**New Components**:

```typescript
// shell/mcp-service/src/types.ts
export interface IMCPService {
  // Get the underlying MCP server for transport layers
  getMcpServer(): McpServer;

  // Direct registration methods (called by PluginManager)
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
  private logger: Logger;
  private messageBus: IMessageBus; // Still needed for tool execution

  constructor(messageBus: IMessageBus, logger: Logger) {
    this.mcpServer = new McpServer({ name: "brain-mcp", version: "1.0.0" });
    this.messageBus = messageBus;
    this.logger = logger.child("MCPService");
    // No event listeners needed - direct registration instead
  }

  public registerTool(pluginId: string, tool: PluginTool): void {
    // Reuse logic from handleToolRegistration
    // Register with mcpServer.tool(...)
  }

  public registerResource(pluginId: string, resource: PluginResource): void {
    // Reuse logic from handleResourceRegistration
    // Register with mcpServer.resource(...)
  }
}
```

### Phase 2: Update PluginManager for Direct Registration

**File**: `shell/plugins/src/manager/pluginManager.ts`

**Changes**:

1. Add MCPService and CommandRegistry as constructor dependencies
2. Remove PluginRegistrationHandler completely
3. Update `initializePlugin()` to use direct registration:

```typescript
private async initializePlugin(pluginId: string): Promise<void> {
  const capabilities = await plugin.register(shell);

  // Direct registration - no events
  for (const command of capabilities.commands) {
    this.commandRegistry.registerCommand(pluginId, command);
  }

  for (const tool of capabilities.tools) {
    this.mcpService.registerTool(pluginId, tool);
  }

  for (const resource of capabilities.resources) {
    this.mcpService.registerResource(pluginId, resource);
  }
}
```

### Phase 3: Update Shell

**File**: `shell/core/src/shell.ts`

**Changes**:

1. Import MCPService
2. Add to ShellDependencies interface
3. Initialize MCPService in constructor (before plugin manager)
4. Pass MCPService to PluginManager constructor
5. Add `getMCPService()` method
6. Register in service registry

### Phase 4: Simplify MCPInterface Plugin

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

### Phase 5: Remove Event-Based Registration

**Files to Update**:

1. **Remove from CommandRegistry** (`shell/command-registry/src/command-registry.ts`):
   - Remove MessageBus subscription in constructor
   - Keep `registerCommand()` method (now called directly)

2. **Delete PluginRegistrationHandler** (`shell/plugins/src/manager/pluginRegistrationHandler.ts`):
   - No longer needed - all registration is direct

3. **Clean up MessageBus events**:
   - Remove `system:command:register`
   - Remove `system:tool:register`
   - Remove `system:resource:register`

### Phase 6: Testing

1. Verify SystemPlugin tools appear in MCP
2. Test both stdio and http transports
3. Test with different plugin initialization orders
4. Verify existing commands still work
5. Confirm no MessageBus events for registration

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
- [ ] Move core logic from MCP handlers to mcp-service
- [ ] Move permission utilities to mcp-service
- [ ] Implement MCPService class with direct registration methods
- [ ] Update PluginManager to use direct registration
- [ ] Remove PluginRegistrationHandler
- [ ] Update CommandRegistry to remove MessageBus subscription
- [ ] Update Shell to include MCPService
- [ ] Update IShell interface
- [ ] Simplify MCPInterface plugin (transport only)
- [ ] Update tests to use direct registration
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
