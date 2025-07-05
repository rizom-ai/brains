# Cleanup Inventory

## Overview

This document tracks technical debt and cleanup tasks that should be addressed before implementing new plugins. These items improve code quality, performance, and maintainability.

## Priority Levels

- 🔴 **Critical** - Blocking issues that affect functionality
- 🟡 **High** - Performance or maintainability issues that should be fixed soon
- 🟢 **Medium** - Nice-to-have improvements
- 🔵 **Low** - Future enhancements

## Recently Completed ✅

- **Fixed Empty Catch Block** - Added proper error logging with debug level
- **Base Entity Directory Structure** - Base entities save to root directory
- **Legacy MessageBus Methods** - Removed registerHandler/unregisterHandler, made publish private
- **Plugin Communication Architecture** - Implemented message-based communication
- **Directory Sync Plugin** - Created for file-based entity storage
- **Git Sync Refactoring** - Split into two plugins with proper separation of concerns
- **Extract Service Interfaces** - Created interfaces for EntityService, QueryProcessor, AIService, EntityRegistry, PluginManager, SchemaRegistry, and ContentTypeRegistry
- **Add Missing Tests** - Added comprehensive tests for AIService, EmbeddingService, MCP resources, and MCP tools
- **Standardize Error Handling** - Implemented comprehensive BrainsError hierarchy with consistent error codes and rich context across all components
- **Async Embedding Generation** - Implemented job queue system with background embedding processing via JobQueueService and JobQueueWorker
- **TypeScript, Test, and Lint Error Resolution** - Fixed all compilation errors, test failures, and lint violations across codebase

## In Progress: Content Management Package - Final Steps

### Completed:

- ✅ Package structure created at `shared/content-management/`
- ✅ Core operations implemented:
  - GenerationOperations (removed regenerate - can be achieved by delete + generate)
  - DerivationOperations
  - EntityQueryService
  - JobTrackingService
  - ContentManager facade
- ✅ Moved utilities (comparator, id-generator) from site-builder to shared package
- ✅ Refactored SiteContentManager (1652 lines → ~235 lines in SiteOperations):
  - Removed all generation/regeneration methods (use ContentManager)
  - Removed all query methods (use ContentManager)
  - Kept ONLY promote/rollback operations (site-specific)
- ✅ Updated site-builder plugin to fully use shared ContentManager
- ✅ 88 tests passing for content management package
- ✅ Fixed entity deletion to require entityType parameter (breaking change)
- ✅ Added database schema constraint for (entityType, id) uniqueness

### Remaining (TODAY):

- ⏳ Make batch operations (generate-all) use async internally to prevent blocking
- ⏳ Add promoteAsync/rollbackAsync for batch promote/rollback operations

## Cleanup Tasks

### 🔴 Critical Issues

None remaining - all critical issues have been resolved!

### 🟡 High Priority

None remaining - all high priority issues have been resolved!

### 🟢 Medium Priority

3. **Add Component Disposal Methods**
   - Issue: Only Shell has shutdown; other components can't cleanup
   - Solution: Add dispose() method to all major components
   - Impact: Memory leaks and resource cleanup issues

4. **Plugin Lifecycle Hooks**
   - Issue: Plugins only have init, no cleanup
   - Solution: Add dispose/shutdown hooks for plugins
   - Related to: Component disposal methods (#3)

5. **Implement Search Highlights**
   - Location: `packages/shell/src/entity/entityService.ts:529`
   - TODO: Search results should include text highlights
   - Impact: Users can't see why results matched their query

6. **Implement Caching Layer**
   - Issue: No caching for embeddings or query results
   - Solution: Add simple in-memory cache with TTL

7. **Add Batch Operations**
   - Issue: Entity operations are one-at-a-time
   - Solution: Add batch create/update/delete methods

8. **Message Bus Handler Management**
   - Issue: Current design wraps handlers, making individual unsubscribe challenging
   - Solution: Refactor to track original handlers for proper unsubscribe
   - Impact: Minor limitation in current implementation

### 🔵 Low Priority

9. **Add Retry Logic**
   - Issue: No retry for external service failures
   - Solution: Implement exponential backoff for AI/embedding calls

10. **Add Metrics/Telemetry**
    - Issue: No performance tracking
    - Solution: Add basic operation timing and counters

## Cleanup Phases

### Phase 1: Critical Fixes ✅ COMPLETED

- [x] Fix empty catch block
- [x] Fix base entity directory structure
- [x] Remove legacy MessageBus methods
- [x] Implement plugin communication architecture

### Phase 2: Architecture Improvements ✅ COMPLETED

- [ ] Add component disposal methods (#3) - DEFERRED TO PHASE 4
- [x] Extract service interfaces (✅ COMPLETED)
- [x] Add async embedding generation (#1) (✅ COMPLETED)

### Phase 3: Quality & Testing ✅ COMPLETED

- [x] Standardize error handling (#2) (✅ COMPLETED)
- [x] Add critical missing tests (✅ COMPLETED)

### Phase 4: Performance (2-3 days)

- [ ] Implement caching layer (#6)
- [ ] Add batch operations (#7)
- [ ] Improve message bus handler management (#8)

## Implementation Notes

### Component Disposal Pattern

```typescript
interface Disposable {
  dispose(): Promise<void>;
}

// All major components should implement this
```

### Error Standardization Pattern

```typescript
export class BrainError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export class EntityNotFoundError extends BrainError {
  constructor(entityType: string, id: string) {
    super(`${entityType} not found: ${id}`, "ENTITY_NOT_FOUND", {
      entityType,
      id,
    });
  }
}
```

### Async Embedding Pattern

```typescript
// Instead of synchronous:
const embedding = await generateEmbedding(text);

// Use queue:
await embeddingQueue.add({ entityId, text });
// Process in background worker
```

## Success Criteria

- All TODOs in code are addressed or have tracking issues
- All components can be properly disposed
- Core services have interfaces for testing
- Error handling is consistent throughout
- Critical paths have test coverage

## Timeline

- **Phase 1**: ✅ Completed
- **Phase 2**: ✅ Completed
- **Phase 3**: ✅ Completed
- **Phase 4**: 2-3 days remaining (optional performance improvements)
- **Total elapsed**: ~9-10 days of cleanup completed
- **Status**: In Progress: Content Management Package Extraction (90% complete)

## Next Steps

1. **Complete Async Operations for Content Management** (TODAY)
   - Make generate-all use async internally
   - Add promoteAsync/rollbackAsync methods
2. **Begin Link Plugin Development** - Core infrastructure is now stable
   - First plugin to demonstrate the new architecture
   - Web content capture with AI
3. **Optional: Phase 4 Performance Improvements** - Can be done in parallel
   - Caching layer
   - Batch operations
   - Message bus improvements
