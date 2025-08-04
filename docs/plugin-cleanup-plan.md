# Plugin System Cleanup Plan

## Overview

This document outlines the plan to clean up the plugin system architecture, focusing on:

1. Consolidating imports to use only @brains/plugins
2. Reorganizing plugin directory structures
3. Removing code duplication
4. Improving overall maintainability

## Phase 1: Prepare Core Package ✅

**Status**: Completed

### Tasks:

- [x] Add missing exports to @brains/plugins:
  - ProgressReporter (type and class)
  - ResponseFormatter
  - ContentFormatter
  - ProgressCallback
- [x] Run tests to verify nothing broke (all 442 tests pass)

## Phase 2: Reorganize Infrastructure

**Status**: Pending

### Tasks:

- [ ] Move mcp-server from `/interfaces/mcp-server/` to `/shared/mcp-server/`
- [ ] Update import paths in mcp interface plugin
- [ ] Run tests

## Phase 3: Clean Up Content Management

**Status**: Pending

### Tasks:

- [ ] Remove duplicate utilities from `/plugins/site-builder/src/content-management/utils/`
  - comparator.ts (duplicate of shared version)
  - id-generator.ts (duplicate of shared version)
- [ ] Update site-builder to use shared content-management utilities
- [ ] Run tests

## Phase 4: Clean Up Plugins (Simple to Complex)

**Status**: Pending

### Standard Directory Structure

Each plugin should follow this structure (only create directories that are actually used):

```
[plugin-name]/
├── src/
│   ├── index.ts          # Main export
│   ├── plugin.ts         # Plugin class
│   ├── config.ts         # Configuration schema
│   ├── types.ts          # Type definitions
│   ├── tools/            # Tool handlers (if any)
│   │   ├── index.ts
│   │   └── [tool-name].ts
│   ├── commands/         # Command handlers (if any)
│   │   ├── index.ts
│   │   └── [command-name].ts
│   ├── resources/        # Resource handlers (if any)
│   │   ├── index.ts
│   │   └── [resource-name].ts
│   ├── handlers/         # Job handlers (if any)
│   │   ├── index.ts
│   │   └── [handler-name].ts
│   ├── formatters/       # Response formatters (if any)
│   │   ├── index.ts
│   │   └── [formatter-name].ts
│   └── lib/              # Internal utilities
│       └── [utility].ts
├── test/
│   └── [test-files].test.ts
└── package.json
```

### Import Standardization

All imports should come from @brains/plugins:

```typescript
// Before (multiple imports)
import { ServicePlugin } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { IEntityService } from "@brains/entity-service";
import type { JobHandler } from "@brains/job-queue";

// After (single import)
import {
  ServicePlugin,
  type Logger,
  type IEntityService,
  type JobHandler,
} from "@brains/plugins";
```

### Implementation Order

#### 4.1 git-sync (Simplest)

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Run tests

#### 4.2 directory-sync

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Run tests

#### 4.3 mcp interface

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Run tests

#### 4.4 webserver interface

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Run tests

#### 4.5 cli interface

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Run tests

#### 4.6 matrix interface

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Run tests

#### 4.7 site-builder (Most Complex)

- [ ] Reorganize directory structure
- [ ] Update all imports to use only @brains/plugins
- [ ] Handle content-management dependency properly
- [ ] Run tests

## Phase 5: Final Verification

**Status**: Pending

### Tasks:

- [ ] Run full test suite
- [ ] Update plugin development documentation
- [ ] Create migration guide for existing plugins
- [ ] Commit with clear message about the refactoring

## Benefits

1. **Single Import Source**: Developers only need to import from @brains/plugins
2. **Clear Structure**: Organized by concern (tools, commands, resources, etc.)
3. **No Duplication**: Shared utilities in one place
4. **Better Maintainability**: Clear separation of concerns
5. **Easier Testing**: Each concern can be tested independently
6. **Faster Development**: Clear patterns for new plugin development

## Success Metrics

- All tests pass after each phase
- No direct imports from shell packages in plugins
- All plugins follow consistent directory structure
- Documentation is updated and accurate
- New plugin development time reduced by 50%

## Notes

- **mcp-server** is infrastructure, not a plugin, so it moves to shared/
- **content-management** remains a shared package (not converted to plugin)
- Test after each step to ensure stability
- Start with simple plugins to establish patterns
