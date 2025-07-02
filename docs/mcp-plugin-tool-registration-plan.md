# MCP Plugin Tool Registration - Integrated Design

## Problem Statement

The current MCP (Model Context Protocol) implementation has evolved into a fragmented system with:

- Disconnected components (orphaned McpServerManager)
- No clear path for plugin tools to reach the MCP interface
- Inconsistent tool registration patterns
- Missing event listener connections
- Plugin registration order dependencies

## Design Goals

1. **Simplicity**: Single, clear path for tool registration
2. **Order Independence**: System works regardless of plugin load order
3. **Permission Integrity**: Respect tool visibility levels based on transport type
4. **Minimal Changes**: Leverage existing infrastructure where possible
5. **Future-Proof**: Support plugin lifecycle hooks when needed

## Proposed Architecture

### Core Design Decision: Event-Driven Registration with Buffering

The MCP interface plugin will:

1. Subscribe to tool/resource registration events immediately upon construction
2. Buffer any events received before the MCP server is ready
3. Process buffered events once initialization is complete
4. Handle new registrations in real-time after initialization

This ensures order independence while maintaining the existing event-driven architecture.

### Architectural Decision: Leverage MessageBus for System Events

After careful consideration, we'll use the existing MessageBus infrastructure to distribute system events to plugins. This approach requires minimal changes and follows established patterns.

**Solution: Publish System Events to MessageBus**

The PluginManager will publish system events to the MessageBus with a "system:" prefix, allowing any plugin to subscribe using the existing `context.subscribe()` method:

```typescript
// In PluginRegistrationHandler
private async handleToolRegistration(tool: PluginTool, pluginId: string): Promise<void> {
  // Existing: Emit to EventEmitter for internal Shell components
  this.events.emit(PluginEvent.TOOL_REGISTER, toolEvent);

  // New: Also publish to MessageBus for plugin consumption
  await this.messageBus.publish('system:tool:register', {
    pluginId,
    tool,
    timestamp: Date.now()
  });
}

// In MCP Interface Plugin
protected override async onRegister(context: PluginContext): Promise<void> {
  // Subscribe to system events via existing subscribe method
  context.subscribe('system:tool:register', (message) => {
    this.handleToolRegistration(message.payload);
  });

  context.subscribe('system:resource:register', (message) => {
    this.handleResourceRegistration(message.payload);
  });
}
```

This approach:

- **No PluginContext changes needed**: Uses existing infrastructure
- **Clean separation**: System events use "system:" prefix convention
- **Consistent patterns**: Follows established MessageBus patterns
- **Order independence**: MessageBus handles buffering and delivery
- **Type safety**: Can define schemas for system messages

### Component Responsibilities

#### 1. MCP Interface Plugin (`interfaces/mcp/src/mcp-interface.ts`)

- **Primary Responsibility**: Bridge between Shell's plugin system and MCP protocol
- **Key Functions**:
  - Create and manage MCP server instance
  - Subscribe to plugin tool/resource events from PluginManager
  - Filter tools based on transport permission level
  - Buffer early registrations until server is ready
  - Register both Shell tools and plugin tools uniformly

#### 2. Plugin System (existing)

- **No Changes Required**: Continue emitting TOOL_REGISTER and RESOURCE_REGISTER events
- Tools continue to have visibility levels
- Plugins continue to expose tools via `getTools()`

#### 3. McpServerManager (to be removed)

- Delete this orphaned code as it's no longer needed
- Its filtering logic moves into the MCP interface plugin

### Implementation Code Structure

```typescript
export class MCPInterface extends InterfacePlugin {
  private permissionLevel: UserPermissionLevel;
  private mcpServer: Server;

  constructor(options: MCPInterfaceOptions) {
    super();
    // Determine permission level based on transport type
    this.permissionLevel = options.transport === "stdio" ? "anchor" : "public";
  }

  protected override async onRegister(context: PluginContext): Promise<void> {
    // Initialize MCP server first
    await this.initializeMcpServer();

    // Register Shell's core tools
    this.registerShellTools(context);

    // Subscribe to system events for plugin tools
    this.setupSystemEventListeners(context);
  }

  private setupSystemEventListeners(context: PluginContext): void {
    // Subscribe to tool registration events via MessageBus
    context.subscribe("system:tool:register", (message) => {
      const { pluginId, tool } = message.payload;
      this.handleToolRegistration(pluginId, tool);
    });

    // Subscribe to resource registration events via MessageBus
    context.subscribe("system:resource:register", (message) => {
      const { pluginId, resource } = message.payload;
      this.handleResourceRegistration(pluginId, resource);
    });
  }

  private handleToolRegistration(pluginId: string, tool: PluginTool): void {
    const toolVisibility = tool.visibility || "anchor";

    if (this.shouldRegisterTool(this.permissionLevel, toolVisibility)) {
      this.mcpServer.tool({
        name: `${pluginId}:${tool.name}`, // Namespace tools by plugin
        description: tool.description,
        schema: tool.inputSchema,
        handler: async (args) => {
          // Execute tool through message bus
          const response = await this.context.sendMessage(
            "plugin:tool:execute",
            {
              pluginId,
              toolName: tool.name,
              args,
            },
          );
          return response.result;
        },
      });
    }
  }

  private shouldRegisterTool(
    serverPermission: UserPermissionLevel,
    toolVisibility: ToolVisibility,
  ): boolean {
    const visibilityHierarchy = {
      anchor: 3,
      trusted: 2,
      public: 1,
    };

    return (
      visibilityHierarchy[serverPermission] >=
      visibilityHierarchy[toolVisibility]
    );
  }
}
```

## Permission System Integration

### How Permissions Work

1. **Transport-Based Server Permissions**:
   - STDIO transport → "anchor" permission (highest)
   - HTTP transport → "public" permission (lowest)

2. **Tool Visibility Levels**:
   - "anchor": Only available to local processes
   - "trusted": Available to trusted clients
   - "public": Available to all clients

3. **Permission Filtering**:
   - Anchor servers can see all tools
   - Public servers can only see public tools
   - Tools are filtered at registration time, not execution time

### Example Permission Scenarios

| Transport | Server Permission | Can Access Tools With Visibility |
| --------- | ----------------- | -------------------------------- |
| STDIO     | anchor            | anchor, trusted, public          |
| HTTP      | public            | public only                      |

## Benefits of This Design

1. **Order Independence**: MessageBus handles delivery regardless of plugin load order
2. **No New APIs**: Uses existing context.subscribe() and sendMessage() methods
3. **Clean Separation**: System events use "system:" prefix convention
4. **Permission Integrity**: Transport-based permissions are enforced consistently
5. **Minimal Changes**: Only need to add MessageBus publishing to PluginRegistrationHandler
6. **Type Safety**: Can define Zod schemas for system event messages
7. **Consistent Architecture**: Follows established patterns for plugin communication

## Migration Steps

1. **Phase 1: Update PluginRegistrationHandler**
   - Add MessageBus publication for TOOL_REGISTER events
   - Add MessageBus publication for RESOURCE_REGISTER events
   - Use "system:" prefix for these system events
   - Define proper message schemas for type safety

2. **Phase 2: Cleanup Orphaned Code**
   - Delete `shell/core/src/mcp/mcpServerManager.ts`
   - Remove MCP exports from Shell's core
   - Update any import statements

3. **Phase 3: Update MCP Interface Plugin**
   - Add system event subscriptions in onRegister method
   - Implement permission-based tool filtering
   - Add tool namespacing by plugin ID
   - Implement tool execution via message bus

4. **Phase 4: Enable Plugin Tool Execution**
   - Add handler in each plugin for 'plugin:tool:execute' messages
   - Ensure plugins can execute their own tools when requested
   - Add proper error handling and response formatting

5. **Phase 5: Testing & Validation**
   - Verify all plugin tools appear in MCP server
   - Test permission filtering with different transports
   - Test plugin load order independence
   - Verify tool execution works correctly

6. **Phase 6: Documentation**
   - Update plugin development guide
   - Document tool visibility requirements
   - Add examples of system event usage
   - Document the tool execution message pattern

## Future Considerations

1. **Plugin Lifecycle Hooks**: The buffering system can be extended to support lifecycle events
2. **Dynamic Tool Updates**: Tools could be registered/unregistered during runtime
3. **Permission Delegation**: Plugins could request elevated permissions for specific tools
4. **Tool Namespacing**: Prevent conflicts between plugins with same tool names
