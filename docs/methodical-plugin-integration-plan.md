# Methodical Plugin System Integration Plan

## Executive Summary

After attempting a large-scale plugin system refactoring that encountered issues with:

- Type casting and schema parsing consistency
- Test harness design
- Job queue data format inconsistencies
- Complex interdependencies

We will revert to a stable commit and methodically integrate the new plugin packages (base-plugin, core-plugin, service-plugin, interface-plugin, message-interface-plugin) in small, validated steps.

## Strategy: Incremental Integration with Validation

### Phase 0: Revert and Prepare (Day 1)

1. **Revert to stable commit** (keeping new plugin packages)
   - `git reset --hard <commit-before-refactoring>`
   - `git checkout HEAD -- shell/plugin-base shared/core-plugin shared/service-plugin shared/interface-plugin shared/message-interface-plugin`
2. **Remove outdated plans**:
   - plugin-type-packages-refactoring.md
   - plugin-context-migration.md
   - plugin-context-redesign-final-plan.md
   - plugin-manager-removal-plan.md

3. **Validate baseline**:
   - Run all tests to ensure stable starting point
   - Document current plugin architecture state

### Phase 1: Foundation Integration (Days 2-3)

#### Step 1.1: Integrate plugin-base package

- Move core plugin system from plugin-utils to shell/plugin-base
- Update Plugin interface to include `register(shell: IShell)` method
- Update BasePlugin to implement new pattern
- Standardize on direct Zod schemas for all plugin configurations
- Remove config builder utilities (PluginConfigBuilder, ToolInputBuilder)
- **Validation**: Plugin base tests pass

#### Step 1.2: Update Shell for new pattern only

- Remove PluginManager completely
- Shell directly calls `plugin.register(this)`
- Update all plugin imports to use new packages
- **Validation**: Shell can load plugins with new pattern

### Phase 2: Core Plugin Integration (Days 4-5)

#### Step 2.1: Migrate ALL core plugins at once

- Update git-sync to extend CorePlugin
- Update any other core plugins
- Remove old plugin-context usage
- **Validation**: All core plugins work with new pattern

### Phase 3: Fix Job Queue Format (Day 6)

#### Step 3.1: Standardize job queue data format

- Update BatchOperation schema to use `data` field only
- Remove `options`, `entityId`, `entityType` fields
- Update BatchJobManager to pass `data` to job handlers
- Update all job handlers to expect data directly
- **Validation**: All job queue tests pass

### Phase 4: Service Plugin Integration (Days 7-8)

#### Step 4.1: Migrate ALL service plugins at once

- Update directory-sync to extend ServicePlugin
- Update site-builder to extend ServicePlugin
- Update content-management utilities
- Remove old context usage
- **Validation**: All service plugins work correctly

### Phase 5: Interface Plugin Integration (Days 9-10)

#### Step 5.1: Migrate ALL interface plugins at once

- Update cli to extend InterfacePlugin
- Update matrix to extend InterfacePlugin
- Update mcp to extend InterfacePlugin
- Update webserver to extend InterfacePlugin
- **Validation**: All interfaces work correctly

### Phase 6: Message Interface Plugin Integration (Day 11)

#### Step 6.1: Update message-interface plugins

- Update base MessageInterfacePlugin to extend InterfacePlugin
- Migrate all message-based interfaces
- **Validation**: Message interfaces work correctly

### Phase 7: Cleanup (Day 12)

#### Step 7.1: Remove old packages

- Delete plugin-utils package completely
- Delete plugin-context package completely
- Remove all old imports
- **Validation**: No references to old packages

#### Step 7.2: Update documentation

- Update plugin development guide
- Update architecture documentation
- Update examples

## Package Overview

### New Packages to Integrate:

1. **shell/plugin-base**: Core plugin system (interfaces, types, BasePlugin)
2. **shared/core-plugin**: CorePlugin class + CorePluginContext + test harness
3. **shared/service-plugin**: ServicePlugin class + ServicePluginContext + test harness
4. **shared/interface-plugin**: InterfacePlugin class + InterfacePluginContext + test harness
5. **shared/message-interface-plugin**: MessageInterfacePlugin class + test harness

### Packages to Remove:

1. **shared/plugin-utils**: Replaced by plugin-base
2. **shell/plugin-context**: Distributed to individual plugin packages

## Key Principles

1. **Fix Before Migrate**: Fix job queue format before migrating service plugins
2. **All or Nothing**: Migrate all plugins of a type together
3. **Validate After Each Phase**: Run tests after each major change
4. **Type Safety**: Use proper schema parsing, no type assertions
5. **Clean Break**: No backward compatibility, clean migration
6. **Config Standardization**: All plugins use direct Zod schemas for configuration and tool inputs

## Config Standardization Pattern

### Plugin Configuration
All plugins should define their configuration using direct Zod schemas:

```typescript
// Good - Direct Zod schema
export const myPluginConfigSchema = basePluginConfigSchema.extend({
  apiUrl: z.string().url().describe("API endpoint URL"),
  timeout: z.number().min(1000).describe("Request timeout in ms"),
}).describe("Configuration for my-plugin");

// Bad - Using config builders
export const myPluginConfig = pluginConfig()
  .requiredString("apiUrl", "API endpoint URL")
  .numberWithDefault("timeout", 5000)
  .build();
```

### Tool Input Schemas
Tool inputs should be defined as plain Zod objects:

```typescript
// Good - Direct Zod schema
this.createTool(
  "fetch-data",
  "Fetch data from API",
  {
    endpoint: z.string().describe("API endpoint path"),
    params: z.record(z.string()).optional().describe("Query parameters"),
  },
  async (input, context) => { ... }
);

// Bad - Using toolInput builder
this.createTool(
  "fetch-data",
  "Fetch data from API",
  toolInput()
    .string("endpoint")
    .custom("params", z.record(z.string()).optional())
    .build(),
  async (input, context) => { ... }
);
```

## Success Metrics

- All tests pass after each phase
- No TypeScript errors
- Plugins work correctly with typed contexts
- Clean separation between plugin types
- Job queue uses consistent data format
- All plugins use direct Zod schemas

## Risk Mitigation

- Fix root causes (job queue) before dependent systems
- Test thoroughly after each phase
- Keep changes focused and atomic
- Document any breaking changes

## Implementation Order

1. Revert and prepare
2. Integrate plugin-base and update Shell
   - Standardize on direct Zod schemas
   - Remove config builders
3. Migrate core plugins
4. Fix job queue data format
5. Migrate service plugins
6. Migrate interface plugins
7. Migrate message interface plugins
8. Clean up old packages

## Next Steps

1. Execute git revert to stable commit
2. Preserve new plugin packages
3. Begin Phase 1 implementation
4. Track progress with TodoWrite tool
