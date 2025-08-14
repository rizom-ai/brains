# Permission System Refactor Plan

## Problem Statement

User permission level determination currently happens at the individual interface plugin level (e.g., Matrix plugin). This should be moved higher up in the architecture chain to provide:

- Single source of truth for permissions
- Consistent permission handling across all interfaces
- Simpler configuration
- Better separation of concerns

## Current Architecture Issues

```
Matrix Event → room-events.ts → PermissionHandler → determineUserPermissionLevel()
                     ↓
            Uses Matrix-specific config:
            - anchorUserId
            - trustedUsers
```

Problems:

1. Each interface implements its own permission logic
2. CLI hardcodes "anchor" for all users
3. Matrix has its own PermissionHandler
4. Base plugin just returns "public" by default

## Proposed Architecture

### High-Level Design

```
App Config → Shell → PermissionService → All Interfaces
                ↓
         Single source of truth
         for user permissions
```

### Implementation Details

#### 1. App Configuration Layer

```typescript
// brain.config.ts
export default defineConfig({
  name: "test-brain",
  version: "1.0.0",

  // NEW: Global permission configuration
  permissions: {
    anchors: [
      "matrix:@admin:example.org",
      "cli:admin",
      "discord:admin#1234"
    ],
    trusted: [
      "matrix:@trusted:example.org",
      "discord:trusted#5678"
    ],
    // Optional: permission rules for patterns
    rules: [
      { pattern: "matrix:@*:admin.org", level: "trusted" },
      { pattern: "cli:*", level: "anchor" } // All CLI users are anchors
    ]
  },

  plugins: [...]
});
```

#### 2. Shell Service Layer

```typescript
// shell/core/src/services/permission-service.ts
export class PermissionService {
  private anchors: Set<string>;
  private trusted: Set<string>;
  private rules: PermissionRule[];

  constructor(config: PermissionConfig) {
    this.anchors = new Set(config.anchors || []);
    this.trusted = new Set(config.trusted || []);
    this.rules = config.rules || [];
  }

  determineUserLevel(
    interfaceType: string,
    userId: string,
  ): UserPermissionLevel {
    const fullId = `${interfaceType}:${userId}`;

    // Check explicit lists first
    if (this.anchors.has(fullId)) return "anchor";
    if (this.trusted.has(fullId)) return "trusted";

    // Then check pattern rules
    for (const rule of this.rules) {
      if (this.matchesPattern(fullId, rule.pattern)) {
        return rule.level;
      }
    }

    return "public";
  }

  private matchesPattern(id: string, pattern: string): boolean {
    // Convert pattern to regex (e.g., "matrix:@*:admin.org" → /^matrix:@.*:admin\.org$/)
    const regex = new RegExp(
      "^" +
        pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
        "$",
    );
    return regex.test(id);
  }
}
```

#### 3. Update Plugin Context

```typescript
// shell/plugins/src/interface/context.ts
export interface InterfacePluginContext extends CorePluginContext {
  // ADD:
  getPermissionService: () => PermissionService;
  // ... existing methods
}

export function createInterfacePluginContext(
  shell: IShell,
  pluginId: string,
): InterfacePluginContext {
  const coreContext = createCorePluginContext(shell, pluginId);

  return {
    ...coreContext,

    // NEW:
    getPermissionService: () => shell.getPermissionService(),

    // ... existing methods
  };
}
```

#### 4. Update MessageInterfacePlugin

```typescript
// shell/plugins/src/message-interface/message-interface-plugin.ts
export abstract class MessageInterfacePlugin<
  TConfig,
> extends InterfacePlugin<TConfig> {
  // Override to use centralized permission service
  public determineUserPermissionLevel(userId: string): UserPermissionLevel {
    const permissionService = this.getContext().getPermissionService();
    return permissionService.determineUserLevel(this.id, userId);
  }

  // buildContext now uses the centralized method
  protected buildContext(
    _input: string,
    context?: Partial<MessageContext>,
  ): MessageContext {
    const userId = context?.userId ?? "default-user";
    const userPermissionLevel =
      context?.userPermissionLevel ?? this.determineUserPermissionLevel(userId);

    return {
      userId,
      channelId: context?.channelId ?? this.sessionId,
      messageId: context?.messageId ?? `msg-${Date.now()}`,
      timestamp: context?.timestamp ?? new Date(),
      interfaceType: this.id,
      userPermissionLevel,
      ...context,
    };
  }
}
```

#### 5. Simplify Matrix Interface

```typescript
// interfaces/matrix/src/lib/matrix-interface.ts
export class MatrixInterface extends MessageInterfacePlugin<MatrixConfig> {
  // REMOVE: private permissionHandler?: PermissionHandler;

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // No more permission handler - just Matrix client
    this.client = new MatrixClientWrapper(this.config, this.logger);
    this.setupEventHandlers();

    this.logger.info("Matrix interface registered", {
      homeserver: this.config.homeserver,
      userId: this.config.userId,
    });
  }

  // The determineUserPermissionLevel method is now inherited from MessageInterfacePlugin
  // and uses the centralized PermissionService
}

// interfaces/matrix/src/handlers/room-events.ts
export async function handleRoomMessage(
  roomId: string,
  event: unknown,
  ctx: MatrixEventHandlerContext,
): Promise<void> {
  // ... extract message details ...

  // Simplified - just call the inherited method
  const permissionLevel = ctx.determineUserPermissionLevel(senderId);

  const messageContext: MessageContext = {
    userId: senderId,
    channelId: roomId,
    messageId: eventId,
    timestamp: new Date(),
    interfaceType: "matrix",
    userPermissionLevel: permissionLevel,
    // ...
  };

  await ctx.handleInput(messageToProcess, messageContext, eventId);
}
```

#### 6. Update CLI Interface

```typescript
// interfaces/cli/src/cli-interface.ts
export class CLIInterface extends MessageInterfacePlugin<CLIConfig> {
  // Remove the hardcoded override
  // Now inherits from MessageInterfacePlugin which uses PermissionService

  public override async processInput(input: string): Promise<void> {
    const context: MessageContext = {
      userId: "cli-user",
      channelId: "cli",
      messageId: `cli-${Date.now()}`,
      timestamp: new Date(),
      interfaceType: "cli",
      userPermissionLevel: this.determineUserPermissionLevel("cli-user"),
      // ↑ Now determined by central service based on config
    };

    await this.handleInput(input, context);
  }
}
```

## Implementation Steps

### Phase 1: Core Infrastructure (2 hours)

1. Create `PermissionService` class in Shell
2. Add permission configuration to `AppConfig` type
3. Initialize `PermissionService` in Shell
4. Add `getPermissionService()` to Shell interface

### Phase 2: Plugin Infrastructure (1 hour)

1. Update `InterfacePluginContext` to provide permission service
2. Update `MessageInterfacePlugin` to use central service
3. Remove default "public" return from `BasePlugin`

### Phase 3: Interface Updates (2 hours)

1. Remove `anchorUserId` and `trustedUsers` from Matrix config schema
2. Remove `PermissionHandler` from Matrix interface
3. Update Matrix event handlers to use inherited method
4. Update CLI to use central permissions (not hardcoded)

### Phase 4: Testing & Documentation (1 hour)

1. Update all affected tests
2. Add tests for PermissionService
3. Update configuration examples
4. Document the new permission system

## Configuration Examples

### Simple Configuration

```typescript
permissions: {
  anchors: ["matrix:@admin:example.org"],
  trusted: ["matrix:@helper:example.org"]
}
```

### Pattern-Based Configuration

```typescript
permissions: {
  anchors: ["matrix:@owner:example.org"],
  rules: [
    { pattern: "cli:*", level: "anchor" },        // All CLI users are anchors
    { pattern: "matrix:@*:admin.org", level: "trusted" }, // Domain-based trust
    { pattern: "discord:*", level: "public" }     // Discord users are public by default
  ]
}
```

## Testing Strategy

```typescript
describe("PermissionService", () => {
  it("should identify explicit anchors");
  it("should identify explicit trusted users");
  it("should apply pattern rules correctly");
  it("should default to public for unknown users");
  it("should handle interface prefixes correctly");
});

describe("MessageInterfacePlugin permissions", () => {
  it("should use central permission service");
  it("should pass correct permission level to context");
  it("should not have local permission logic");
});

describe("Matrix interface permissions", () => {
  it("should not have local PermissionHandler");
  it("should use inherited determineUserPermissionLevel");
  it("should work with central permission config");
});
```

## Benefits

1. **Single Configuration Point**: All permissions in `brain.config.ts`
2. **Consistent Behavior**: Same permission logic everywhere
3. **Pattern Support**: Flexible rule-based permissions
4. **Clean Separation**: Interfaces handle interface logic only
5. **Easier Testing**: Permission logic isolated in one service
6. **Better Maintainability**: One place to update permission logic

## Success Criteria

- [ ] All permissions configured in app config
- [ ] No permission logic in individual interfaces
- [ ] Matrix interface uses central permissions
- [ ] CLI interface uses central permissions
- [ ] All tests pass
- [ ] No performance degradation

## Total Implementation Time

Estimated: 6 hours

## Next Steps

1. Review and approve this plan
2. Create feature branch
3. Implement PermissionService
4. Update plugins and interfaces
5. Test thoroughly
6. Update documentation

## Complete Architecture Overview (Updated)

### Core Principle: Shell-Level Permission Determination

All permission determination happens at the Shell level using the centralized PermissionService. Interfaces and handlers should **never** determine permissions themselves.

### Permission Flow

1. **Interfaces** (Matrix, CLI, etc.) pass minimal context:
   - `userId`: The user identifier  
   - `interfaceType`: The interface type (matrix, cli, discord, etc.)
   - NO permission determination at interface level

2. **Shell Level** determines permissions when needed:
   - Commands: Permission check in InterfacePluginContext
   - Tools: Permission filtering in MCP service (already implemented)
   - Templates: Permission check in Shell.generateContent() (already implemented)
   - Messages: Permission determination in MessageInterfacePlugin

### Updated Component Responsibilities

#### InterfacePluginContext
```typescript
// Commands no longer receive userPermissionLevel directly
export interface CommandContext {
  userId: string;
  channelId: string;
  interfaceType: string;
  userPermissionLevel: UserPermissionLevel; // Determined by context, not passed by caller
}

// Context methods determine permissions internally
listCommands: async (userPermissionLevel?: UserPermissionLevel) => {
  // If not provided, determine from current context
  const level = userPermissionLevel ?? determineFromContext();
  return commandRegistry.listCommands(level);
}

executeCommand: async (commandName, args, context) => {
  // Permission level in context is determined by InterfacePluginContext
  const command = commandRegistry.findCommand(commandName, context.userPermissionLevel);
  // ...
}
```

#### MessageInterfacePlugin
```typescript
export abstract class MessageInterfacePlugin {
  // Centralized permission determination
  public determineUserPermissionLevel(userId: string): UserPermissionLevel {
    const permissionService = this.getContext().shell.getPermissionService();
    return permissionService.determineUserLevel(this.id, userId);
  }

  protected buildContext(input: string, context?: Partial<MessageContext>): MessageContext {
    const userId = context?.userId ?? "default-user";
    const userPermissionLevel = 
      context?.userPermissionLevel ?? this.determineUserPermissionLevel(userId);
    // ...
  }

  // When executing commands, determine permission level
  public async executeCommand(command: string, context: MessageContext) {
    const userPermissionLevel = this.determineUserPermissionLevel(context.userId);
    // Pass to command with determined permission level
    const commandContext = {
      ...context,
      userPermissionLevel
    };
    // ...
  }
}
```

#### Matrix Interface (Example)
```typescript
// No permission logic at all
const messageContext: MessageContext = {
  userId: senderId,
  channelId: roomId,
  messageId: eventId,
  timestamp: new Date(),
  interfaceType: "matrix",
  userPermissionLevel: "public", // Default, will be overridden by MessageInterfacePlugin
  // ...
};

// handleInput will determine the actual permission level
await ctx.handleInput(message, messageContext);
```

### Tool and Resource Filtering

Tools and resources already have proper permission filtering:

1. **Tools** have `visibility` property (public, trusted, anchor)
2. **MCP Service** filters during registration using `shouldRegisterTool()`
3. **PermissionService** provides `filterByPermission()` for generic filtering

### Benefits of This Architecture

1. **Single Source of Truth**: All permissions determined by PermissionService
2. **Consistency**: Same permission logic everywhere
3. **Maintainability**: Permission changes only require updates in one place
4. **Security**: Interfaces can't bypass permission checks
5. **Flexibility**: Easy to add new permission rules or patterns

### Testing Strategy

1. **Unit Tests**: PermissionService with various configurations
2. **Integration Tests**: Permission flow through interfaces
3. **Mock Strategy**: Test harness provides configured PermissionService
4. **Coverage**: Pattern matching, explicit lists, priority rules

### Migration Status

1. ✅ Create PermissionService in Shell
2. ✅ Add permission configuration to App/Shell config  
3. ✅ Move filterByPermission logic to PermissionService
4. ✅ Update Matrix interface to remove local permission logic
5. ⏳ Fix Matrix interface tests with mocked PermissionService
6. ⏳ Update MessageInterfacePlugin.buildContext()
7. ⏳ Update MessageInterfacePlugin.executeCommand()
8. ⏳ Update CLI interface to use central permissions
9. ⏳ Consider removing old PermissionHandler from utils
