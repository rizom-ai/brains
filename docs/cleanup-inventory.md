# Cleanup Inventory

## Overview

This document tracks technical debt and cleanup tasks that should be addressed before implementing new plugins. These items improve code quality, performance, and maintainability.

## Priority Levels

- 🔴 **Critical** - Blocking issues that affect functionality
- 🟡 **High** - Performance or maintainability issues that should be fixed soon
- 🟢 **Medium** - Nice-to-have improvements
- 🔵 **Low** - Future enhancements

## Cleanup Tasks

### 🔴 Critical Issues

1. **Fix Empty Catch Block**
   - Location: `packages/shell/src/entity/entityService.ts:601`
   - Issue: Catch block without error parameter swallows errors
   - Fix: Add proper error logging

### 🟡 High Priority

2. **Base Entity Directory Structure** ✅ DONE
   - Fixed: Base entities now save to root directory instead of `base/` subdirectory
   - Other entity types continue to use subdirectories

### 🟢 Medium Priority

3. **Implement Search Highlights** (moved from high priority)

   - Location: `packages/shell/src/entity/entityService.ts:529`
   - TODO: Search results should include text highlights
   - Impact: Users can't see why results matched their query

4. **Add Async Embedding Generation** (moved from high priority)

   - Issue: Synchronous embedding generation blocks operations
   - Solution: Queue embeddings for background processing

5. **Add Component Disposal Methods**
   - Issue: Only Shell has shutdown; other components can't cleanup
   - Solution: Add dispose() method to all major components

### 🟢 Medium Priority

6. **Extract Service Interfaces**

   - Issue: Core services are concrete classes, hard to test
   - Solution: Create interfaces for EntityService, QueryProcessor, etc.

7. **Standardize Error Handling**

   - Issue: Mix of Error objects and strings, no error codes
   - Solution: Create custom error classes with codes

8. **Add Missing Tests**

   - Critical untested files:
     - `packages/shell/src/ai/aiService.ts`
     - `packages/shell/src/embedding/embeddingService.ts`
     - `packages/shell/src/mcp/resources.ts`
     - `packages/shell/src/mcp/tools.ts`

9. **Implement Caching Layer**

   - Issue: No caching for embeddings or query results
   - Solution: Add simple in-memory cache with TTL

10. **Add Batch Operations**
    - Issue: Entity operations are one-at-a-time
    - Solution: Add batch create/update/delete methods

### 🔵 Low Priority

11. **Add Retry Logic**

    - Issue: No retry for external service failures
    - Solution: Implement exponential backoff for AI/embedding calls

12. **Add Metrics/Telemetry**

    - Issue: No performance tracking
    - Solution: Add basic operation timing and counters

13. **Plugin Lifecycle Hooks**
    - Issue: Plugins only have init, no cleanup
    - Solution: Add dispose/shutdown hooks for plugins

## Cleanup Phases

### Phase 1: Critical Fixes (1 day)

- [ ] Fix empty catch block (#1)
- [x] Fix base entity directory structure (DONE)
- [x] Remove outdated schema validation TODO (DONE)

### Phase 2: Architecture Improvements (3-4 days)

- [ ] Add async embedding generation (#4)
- [ ] Add component disposal methods (#5)
- [ ] Extract service interfaces (#6)

### Phase 3: Quality & Testing (2-3 days)

- [ ] Standardize error handling (#7)
- [ ] Add critical missing tests (#8)

### Phase 4: Performance (2-3 days)

- [ ] Implement caching layer (#9)
- [ ] Add batch operations (#10)

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

Estimated total time: 8-12 days of cleanup work before starting Link Plugin implementation.
