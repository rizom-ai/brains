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

## Cleanup Tasks

### 🔴 Critical Issues

None remaining - all critical issues have been resolved!

### 🟡 High Priority

1. **Extract Service Interfaces**
   - Issue: Core services are concrete classes, hard to test
   - Solution: Create interfaces for EntityService, QueryProcessor, etc.
   - Impact: Blocks proper testing of all components that use these services
   - **Why High**: Foundation for all testing efforts

2. **Add Missing Tests**
   - Critical untested files:
     - `packages/shell/src/ai/aiService.ts`
     - `packages/shell/src/embedding/embeddingService.ts`
     - `packages/shell/src/mcp/resources.ts`
     - `packages/shell/src/mcp/tools.ts`
   - New plugin test coverage:
     - More comprehensive tests for directory-sync
     - Integration tests for git-sync with directory-sync
   - **Why High**: Critical components lack test coverage, risk of regressions

3. **Add Async Embedding Generation**
   - Issue: Synchronous embedding generation blocks operations
   - Solution: Queue embeddings for background processing
   - Impact: Every entity creation blocks for ~200-500ms
   - **Why High**: Direct impact on user experience

4. **Standardize Error Handling**
   - Issue: Mix of Error objects and strings, no error codes
   - Solution: Create custom error classes with codes
   - Impact: Poor debugging experience, inconsistent error messages
   - **Why High**: Affects debugging and user experience

### 🟢 Medium Priority

5. **Add Component Disposal Methods**
   - Issue: Only Shell has shutdown; other components can't cleanup
   - Solution: Add dispose() method to all major components
   - Impact: Memory leaks and resource cleanup issues

6. **Plugin Lifecycle Hooks**
   - Issue: Plugins only have init, no cleanup
   - Solution: Add dispose/shutdown hooks for plugins
   - Related to: Component disposal methods (#5)

7. **Implement Search Highlights**
   - Location: `packages/shell/src/entity/entityService.ts:529`
   - TODO: Search results should include text highlights
   - Impact: Users can't see why results matched their query

8. **Implement Caching Layer**
   - Issue: No caching for embeddings or query results
   - Solution: Add simple in-memory cache with TTL

9. **Add Batch Operations**
   - Issue: Entity operations are one-at-a-time
   - Solution: Add batch create/update/delete methods

10. **Message Bus Handler Management**
    - Issue: Current design wraps handlers, making individual unsubscribe challenging
    - Solution: Refactor to track original handlers for proper unsubscribe
    - Impact: Minor limitation in current implementation

### 🔵 Low Priority

11. **Add Retry Logic**
    - Issue: No retry for external service failures
    - Solution: Implement exponential backoff for AI/embedding calls

12. **Add Metrics/Telemetry**
    - Issue: No performance tracking
    - Solution: Add basic operation timing and counters

## Cleanup Phases

### Phase 1: Critical Fixes ✅ COMPLETED

- [x] Fix empty catch block
- [x] Fix base entity directory structure 
- [x] Remove legacy MessageBus methods
- [x] Implement plugin communication architecture

### Phase 2: Architecture Improvements (3-4 days)

- [ ] Add component disposal methods (#1)
- [ ] Extract service interfaces (#2)
- [ ] Add async embedding generation (#4)

### Phase 3: Quality & Testing (2-3 days)

- [ ] Standardize error handling (#5)
- [ ] Add critical missing tests (#6)

### Phase 4: Performance (2-3 days)

- [ ] Implement caching layer (#7)
- [ ] Add batch operations (#8)
- [ ] Improve message bus handler management (#9)

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
- **Phases 2-4**: 8-11 days remaining
- **Total elapsed**: ~3-4 days of cleanup completed
- **Remaining**: ~8 days of cleanup work before starting Link Plugin implementation

## Next Steps

1. Begin Phase 2 with component disposal methods
2. Extract service interfaces for better testability
3. Continue with async embedding generation
4. Consider starting Link Plugin development in parallel with Phase 3/4 cleanup
