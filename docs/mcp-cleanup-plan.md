# MCP Interface Cleanup Plan (Final)

## Overview

Clean up the MCP interface to follow the same structure as other plugins (git-sync, directory-sync) by extracting concerns into separate files.

## Key Insight

The tools currently named `shell:*` are actually MCP-specific tools - they're MCP's interface to shell operations, not shell tools. They should be renamed to `mcp:*` and treated as MCP's own tools, allowing us to use the standard plugin structure.

## Implementation Plan

### Phase 1: Rename Configuration File

**From**: `interfaces/mcp/src/schemas.ts`
**To**: `interfaces/mcp/src/config.ts`

Keep the same contents:

- `mcpConfigSchema`
- `MCPConfig` type
- `MCPConfigInput` type

### Phase 2: Extract MCP Tools

**Location**: `interfaces/mcp/src/tools/index.ts`

Create `createMCPTools()` function following the same pattern as git-sync and directory-sync.

**Parameters**:

- `context: InterfacePluginContext`
- `logger: Logger`
- `pluginId: string`

**Tools to rename and extract**:

1. `shell:query` → `mcp:query` - Query the knowledge base using AI-powered search
2. `shell:search` → `mcp:search` - Search entities by type and query
3. `shell:get` → `mcp:get` - Get a specific entity by type and ID
4. `shell:create` → `mcp:create` - Create a new entity
5. `shell:check-job-status` → `mcp:check-job-status` - Check the status of background operations

### Phase 3: Extract Event Handlers

**Location**: `interfaces/mcp/src/handlers/`

#### `plugin-events.ts`

Extract methods that handle plugin tool/resource registration:

- `handleToolRegistration()`
- `handleResourceRegistration()`
- `setupSystemEventListeners()`

#### `job-progress.ts`

Extract job progress event handling:

- `setupJobProgressListener()`

### Phase 4: Extract Permission Utilities

**Location**: `interfaces/mcp/src/utils/permissions.ts`

Move permission checking logic:

- `getPermissionLevel()`
- `shouldRegisterTool()`
- `shouldRegisterResource()`

### Phase 5: Update Imports

Change all imports to use `@brains/plugins` where types are available:

- `UserPermissionLevel` - from @brains/utils → @brains/plugins
- `JobProgressEvent` - from @brains/job-queue → @brains/plugins
- Keep `@brains/mcp-server` import as it's infrastructure

### Phase 6: Update Main Class

The main class should:

- Call `createMCPTools()` and register those tools
- Use extracted handlers and utilities
- Focus on core responsibilities:
  - Constructor and configuration
  - Server lifecycle management
  - Daemon implementation
  - Orchestration of components

## Final Structure

```
interfaces/mcp/src/
├── index.ts                    # Main export
├── mcp-interface.ts           # Main class (~300 lines, down from 708)
├── config.ts                  # Configuration schema and types
├── types.ts                   # Any additional types (if needed)
├── tools/
│   └── index.ts               # MCP tools with createMCPTools()
├── handlers/
│   ├── plugin-events.ts      # Plugin tool/resource registration
│   └── job-progress.ts        # Progress event handling
└── utils/
    └── permissions.ts         # Permission checking utilities
```

## Implementation Order

1. **Rename config file**
   - Rename `schemas.ts` to `config.ts`
   - Update import in `mcp-interface.ts`
   - Update import in `index.ts`

2. **Extract MCP Tools**
   - Create `tools/index.ts`
   - Implement `createMCPTools()` function
   - Rename all tools from `shell:*` to `mcp:*`
   - Update main class to use `createMCPTools()`

3. **Extract Event Handlers**
   - Create `handlers/plugin-events.ts`
   - Move tool/resource registration methods
   - Create `handlers/job-progress.ts`
   - Move job progress listener
   - Update main class to import and use

4. **Extract Permission Utilities**
   - Create `utils/permissions.ts`
   - Move permission methods
   - Export functions
   - Update all references

5. **Update Imports**
   - Change to use @brains/plugins where possible
   - Ensure all files use consistent imports

6. **Clean Up Main Class**
   - Remove extracted methods
   - Add imports for extracted modules
   - Simplify to core responsibilities

7. **Test Everything**
   - Run MCP interface tests
   - Verify MCP tools work correctly
   - Verify plugin tools are still registered
   - Check that events are handled correctly

## Key Differences from Previous Plan

1. **Tools are MCP's own** - Not "shell tools" but MCP's interface to shell operations
2. **Standard structure applies** - Since these are MCP's tools, we can use the same pattern as other plugins
3. **Tool naming** - Changed from `shell:*` to `mcp:*` to reflect ownership
4. **No architectural conflict** - These tools belong to MCP, so using InterfacePluginContext is appropriate

## Benefits

1. **Consistency**
   - MCP follows the same structure as git-sync and directory-sync
   - Standard patterns make it easier to understand

2. **Better Organization**
   - 708 lines split into focused files
   - Each file has a single responsibility

3. **Clarity**
   - Tool names (`mcp:*`) clearly indicate they belong to MCP
   - Structure shows MCP is a first-class interface with its own tools

4. **Maintainability**
   - Smaller files are easier to modify
   - Changes are more isolated
   - Clear separation of concerns

## Success Criteria

- [ ] MCP interface reduced from 708 lines to ~300 lines in main file
- [ ] All tests pass
- [ ] MCP tools work correctly with new names
- [ ] Plugin tools/resources still registered correctly
- [ ] Job progress events still handled
- [ ] File structure matches other plugins
- [ ] No functionality lost during refactoring
- [ ] Code follows standard patterns

## Notes

- The renaming from `shell:*` to `mcp:*` is a breaking change for MCP clients
- This change better reflects the architecture - each interface exposes functionality in its own way
- Future interfaces can expose similar functionality with their own tool names
