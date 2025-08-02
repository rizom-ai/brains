# Plugin Package Consolidation Plan

## Overview

Consolidate all 5 shared plugin packages into `shell/plugins`, eliminating duplication and creating a single source of truth for the plugin infrastructure.

## Current State

- **Duplicate BasePlugin implementations:**
  - `shell/plugins/src/base-plugin.ts` - Shell-specific with CoreContext and IShell
  - `shared/plugin-utils/src/base-plugin.ts` - Generic with PluginContext

- **5 shared packages with inheritance hierarchy:**
  - `shared/plugin-utils` - BasePlugin and config utilities
  - `shared/core-plugin` - CorePlugin extends BasePlugin
  - `shared/service-plugin` - ServicePlugin extends BasePlugin
  - `shared/interface-plugin` - InterfacePlugin extends BasePlugin
  - `shared/message-interface-plugin` - MessageInterfacePlugin extends InterfacePlugin

## Phase 1: Remove plugin-utils Package

1. **Update git-sync imports**
   - Change `plugins/git-sync/src/types.ts`
   - From: `import { basePluginConfigSchema } from "@brains/plugin-utils"`
   - To: `import { basePluginConfigSchema } from "@brains/plugins"`

2. **Delete plugin-utils package**
   - Remove entire `shared/plugin-utils/` directory
   - This eliminates the duplicate BasePlugin implementation

## Phase 2: Prepare Shell Plugins Structure

1. **Create new directory structure in shell/plugins/src/**
   ```
   shell/plugins/src/
   ├── base/
   │   ├── base-plugin.ts (move existing from root)
   │   └── core-plugin.ts
   ├── service/
   │   └── service-plugin.ts
   ├── interface/
   │   ├── interface-plugin.ts
   │   └── message-interface-plugin.ts
   ├── contexts/
   │   ├── core-context.ts
   │   ├── service-context.ts
   │   ├── interface-context.ts
   │   └── message-interface-context.ts
   ├── test/
   │   ├── core-harness.ts
   │   ├── service-harness.ts
   │   ├── interface-harness.ts
   │   └── message-interface-harness.ts
   ├── examples/
   │   ├── calculator-plugin.ts
   │   ├── calculator-service-plugin.ts
   │   ├── webserver-interface-plugin.ts
   │   └── echo-message-interface.ts
   └── utils/
       └── progress-handler.ts
   ```

## Phase 3: Migrate Core Plugin

1. **Move files from shared/core-plugin**
   - `src/core-plugin.ts` → `shell/plugins/src/base/core-plugin.ts`
   - `src/context.ts` → `shell/plugins/src/contexts/core-context.ts`
   - `src/test/harness.ts` → `shell/plugins/src/test/core-harness.ts`
   - `examples/calculator-plugin.ts` → `shell/plugins/src/examples/calculator-plugin.ts`

2. **Update CorePlugin imports**
   - Change to import BasePlugin from relative path `../base-plugin`
   - Update context imports

3. **Delete shared/core-plugin package**

## Phase 4: Migrate Service Plugin

1. **Move files from shared/service-plugin**
   - `src/service-plugin.ts` → `shell/plugins/src/service/service-plugin.ts`
   - `src/context.ts` → `shell/plugins/src/contexts/service-context.ts`
   - `src/test-harness.ts` → `shell/plugins/src/test/service-harness.ts`
   - `examples/calculator-service-plugin.ts` → `shell/plugins/src/examples/calculator-service-plugin.ts`

2. **Update ServicePlugin to extend from local BasePlugin**
   - Change imports to use relative paths

3. **Delete shared/service-plugin package**

## Phase 5: Migrate Interface Plugin

1. **Move files from shared/interface-plugin**
   - `src/interface-plugin.ts` → `shell/plugins/src/interface/interface-plugin.ts`
   - `src/context.ts` → `shell/plugins/src/contexts/interface-context.ts`
   - `src/test-harness.ts` → `shell/plugins/src/test/interface-harness.ts`
   - `examples/webserver-interface-plugin.ts` → `shell/plugins/src/examples/webserver-interface-plugin.ts`

2. **Update InterfacePlugin to extend from local BasePlugin**

3. **Delete shared/interface-plugin package**

## Phase 6: Migrate Message Interface Plugin

1. **Move files from shared/message-interface-plugin**
   - `src/base/message-interface-plugin.ts` → `shell/plugins/src/interface/message-interface-plugin.ts`
   - `src/base/types.ts` → `shell/plugins/src/interface/message-interface-types.ts`
   - `src/context.ts` → `shell/plugins/src/contexts/message-interface-context.ts`
   - `src/test-harness.ts` → `shell/plugins/src/test/message-interface-harness.ts`
   - `src/utils/progress-handler.ts` → `shell/plugins/src/utils/progress-handler.ts`
   - `examples/echo-message-interface.ts` → `shell/plugins/src/examples/echo-message-interface.ts`

2. **Update MessageInterfacePlugin to extend from local InterfacePlugin**

3. **Delete shared/message-interface-plugin package**

## Phase 7: Update Shell Plugins Exports

1. **Update shell/plugins/src/index.ts**

   ```typescript
   // Base classes
   export { BasePlugin } from "./base/base-plugin";
   export { CorePlugin } from "./base/core-plugin";
   export { ServicePlugin } from "./service/service-plugin";
   export { InterfacePlugin } from "./interface/interface-plugin";
   export { MessageInterfacePlugin } from "./interface/message-interface-plugin";

   // Contexts
   export { createCorePluginContext } from "./contexts/core-context";
   export { createServicePluginContext } from "./contexts/service-context";
   export { createInterfacePluginContext } from "./contexts/interface-context";
   export { createMessageInterfacePluginContext } from "./contexts/message-interface-context";

   // Context types
   export type { CorePluginContext } from "./contexts/core-context";
   export type { ServicePluginContext } from "./contexts/service-context";
   export type { InterfacePluginContext } from "./contexts/interface-context";
   export type { MessageInterfacePluginContext } from "./contexts/message-interface-context";

   // Test utilities
   export { CorePluginTestHarness } from "./test/core-harness";
   export { ServicePluginTestHarness } from "./test/service-harness";
   export { InterfacePluginTestHarness } from "./test/interface-harness";
   export { MessageInterfacePluginTestHarness } from "./test/message-interface-harness";

   // Utils
   export { setupProgressHandler } from "./utils/progress-handler";

   // Message interface types
   export type { commandResponseSchema } from "./interface/message-interface-types";

   // Keep existing exports
   export * from "./interfaces";
   export * from "./config";
   export * from "./errors";
   export * from "./manager";
   ```

## Phase 8: Update All Plugin Implementations

1. **Update imports in plugin implementations**
   - `plugins/git-sync/src/plugin.ts` - Change from `@brains/core-plugin` to `@brains/plugins`
   - `plugins/directory-sync/src/plugin.ts` - Change from `@brains/service-plugin` to `@brains/plugins`
   - `plugins/site-builder/src/plugin.ts` - Change from `@brains/service-plugin` to `@brains/plugins`
   - `interfaces/cli/src/cli-interface.ts` - Change from `@brains/message-interface-plugin` to `@brains/plugins`
   - `interfaces/matrix/src/matrix-interface.ts` - Change from `@brains/message-interface-plugin` to `@brains/plugins`
   - `interfaces/mcp/src/mcp-interface.ts` - Change from `@brains/interface-plugin` to `@brains/plugins`
   - `interfaces/webserver/src/webserver-interface.ts` - Change from `@brains/interface-plugin` to `@brains/plugins`

2. **Update test files** - Update all test imports similarly

3. **Update shared/content-management imports** - Update any imports from the old packages

## Phase 9: Clean Up Package Dependencies

1. **Remove old dependencies from package.json files**
   - Remove `@brains/plugin-utils` from all package.json files
   - Remove `@brains/core-plugin` from all package.json files
   - Remove `@brains/service-plugin` from all package.json files
   - Remove `@brains/interface-plugin` from all package.json files
   - Remove `@brains/message-interface-plugin` from all package.json files
   - Add `@brains/plugins` where needed

## Phase 10: Testing and Verification

1. **Run comprehensive tests**
   - `bun run typecheck` at root
   - `bun test` at root
   - `bun run lint` at root

2. **Verify examples still work**
   - Test that example plugins compile and run correctly

3. **Commit changes**
   - Single commit: "refactor: consolidate all plugin packages into shell/plugins"

## Benefits

- **Eliminates ~2,000 lines of duplicate code**
- **Reduces from 6 packages to 1 unified package**
- **Single source of truth for plugin infrastructure**
- **Clearer architecture and easier maintenance**
- **Examples consolidated in one place**
- **Test harnesses consolidated for easier testing**

## Notes

- All existing APIs remain unchanged - this is purely a reorganization
- The inheritance hierarchy remains the same: BasePlugin → CorePlugin → ServicePlugin/InterfacePlugin → MessageInterfacePlugin
- All imports change from specific packages to `@brains/plugins`
- The shell/plugins BasePlugin becomes the single authoritative implementation
