# EntityService Package Extraction Plan

## Problem Statement

During the Phase 3 PluginContext refactoring, we discovered that the directory-sync plugin requires access to entity serialization capabilities that are currently internal to EntityService. This exposed a fundamental architectural issue: EntityService is tightly coupled to the shell package, making it difficult to provide clean abstractions to plugins.

### Current Issues

1. **Tight Coupling**: EntityService lives in `packages/shell/src/entity/`, making it part of shell's internal implementation
2. **Leaky Abstractions**: PublicEntityService interface became identical to EntityService when we added required methods
3. **Plugin Dependencies**: Directory-sync plugin needs entity serialization but shouldn't access internal adapter management
4. **Architectural Inconsistency**: EntityService should be a first-class service, not a shell implementation detail

## Proposed Solution

Extract EntityService into its own package (`packages/entity-service/`) to create proper separation of concerns and enable clean plugin access patterns.

## Architecture Changes

### Before (Current State)

```
packages/shell/
├── src/entity/
│   ├── entityService.ts     # EntityService implementation
│   └── entityRegistry.ts    # EntityRegistry implementation
└── test/entity/
    ├── entityService.test.ts
    └── entityRegistry.test.ts

packages/types/src/services.ts  # PublicEntityService interface
```

**Dependencies**: Shell → Types, DB, Base-Entity, Utils

### After (Target State)

```
packages/entity-service/
├── src/
│   ├── entityService.ts     # Moved from shell
│   ├── entityRegistry.ts    # Moved from shell
│   └── index.ts            # Exports
├── test/
│   ├── entityService.test.ts  # Moved from shell
│   └── entityRegistry.test.ts # Moved from shell
├── package.json
└── tsconfig.json

packages/types/src/services.ts  # Enhanced PublicEntityService interface
```

**Dependencies**: EntityService → Types, DB, Base-Entity, Utils
**Usage**: Shell → EntityService (as dependency)

## Implementation Plan

### Step 1: Create EntityService Package Structure

Create new package with proper TypeScript and dependency configuration:

```json
// packages/entity-service/package.json
{
  "name": "@brains/entity-service",
  "dependencies": {
    "@brains/types": "workspace:*",
    "@brains/base-entity": "workspace:*",
    "@brains/db": "workspace:*",
    "@brains/utils": "workspace:*"
  }
}
```

### Step 2: Move Files

**Source Files:**

- `packages/shell/src/entity/entityService.ts` → `packages/entity-service/src/entityService.ts`
- `packages/shell/src/entity/entityRegistry.ts` → `packages/entity-service/src/entityRegistry.ts`

**Test Files:**

- `packages/shell/test/entity/entityService.test.ts` → `packages/entity-service/test/entityService.test.ts`
- `packages/shell/test/entity/entityRegistry.test.ts` → `packages/entity-service/test/entityRegistry.test.ts`

**New Files:**

- `packages/entity-service/src/index.ts` - Export EntityService and EntityRegistry
- `packages/entity-service/tsconfig.json` - TypeScript configuration

### Step 3: Update Shell Package

1. Add dependency: `"@brains/entity-service": "workspace:*"`
2. Update imports in `packages/shell/src/shell.ts`
3. Remove `packages/shell/src/entity/` directory
4. Remove `packages/shell/test/entity/` directory
5. Update any other shell files that import from entity/

### Step 4: Enhance PublicEntityService Interface

Add serialization methods to PublicEntityService (in `packages/types/src/services.ts`):

```typescript
export interface PublicEntityService {
  // Existing CRUD operations...

  // Serialization operations (needed by directory-sync)
  getSerializableEntityTypes(): string[];
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): BaseEntity;
  canSerialize(entityType: string): boolean;

  // Existing operations...
}
```

### Step 5: Implement Serialization Methods

Update EntityService implementation to provide serialization methods that delegate to existing adapter roundtrip methods:

- `serializeEntity` calls `adapter.toMarkdown(entity)`
- `deserializeEntity` calls `adapter.fromMarkdown(markdown)`
- `getSerializableEntityTypes` returns entity types that have adapters
- `canSerialize` checks if adapter exists for entity type

### Step 6: Fix Directory-Sync Plugin

Update `packages/directory-sync/src/plugin.ts` and `packages/directory-sync/src/directorySync.ts`:

1. Remove direct adapter access (`getAdapter`, `hasAdapter`)
2. Use new serialization methods from PublicEntityService
3. Replace event handlers that were using messageBus with EventEmitter

### Step 7: Testing and Validation

1. Verify TypeScript compilation across all packages
2. Run EntityService tests in new package location
3. Run shell tests to ensure integration still works
4. Test directory-sync plugin functionality
5. Run full test suite to catch any regressions

## Benefits

1. **Clean Separation**: EntityService becomes a first-class service
2. **Proper Abstractions**: Plugins get clean access through PublicEntityService
3. **Reusability**: EntityService can be used by other applications
4. **Maintainability**: Clear boundaries between packages
5. **Testability**: EntityService can be tested in isolation

## Migration Notes

- This is purely a structural change - no business logic changes
- All existing APIs remain the same
- Shell usage of EntityService unchanged (just imports from different package)
- Plugin access improved through enhanced PublicEntityService

## Risks and Mitigation

- **Risk**: Breaking existing imports
- **Mitigation**: Careful update of all import statements and thorough testing

- **Risk**: Circular dependencies
- **Mitigation**: EntityService only depends on foundational packages (types, db, base-entity, utils)

- **Risk**: Test failures due to path changes
- **Mitigation**: Update test helper imports and run full test suite

## Timeline

This extraction should be completed as a single atomic change to avoid intermediate broken states. Estimated effort: 1-2 hours including testing.
