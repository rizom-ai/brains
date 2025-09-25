# Core Compilation Memory Exhaustion Fix Plan

## Problem Analysis

### Current Issue

Core package is experiencing **JavaScript heap out of memory** crashes during TypeScript compilation, making it completely unusable.

### Root Cause Investigation

After systematic analysis, the issue is a **combination of circular dependencies and heavy service imports**:

#### 1. Complex Circular Dependency Web

```
Core → Plugins → Entity-Service ← Core (direct heavy import)
Core → Plugins → Job-Queue ← Core (direct heavy import)
Core → Plugins → MCP-Service ← Core (via plugins types)
```

#### 2. Heavy Service Implementation Imports

Core is directly importing concrete service classes with heavy Drizzle ORM implementations:

**In `core/src/shell.ts`:**

- Line 13: `EntityService from "@brains/entity-service/src/service"`
- Line 14: `JobQueueService, JobProgressMonitor, BatchJobManager, JobQueueWorker from "@brains/job-queue/src/service"`

**In `core/src/initialization/shellInitializer.ts`:**

- Line 3: `EntityRegistry, EntityService from "@brains/entity-service/src/service"`
- Line 19: `ConversationService from "@brains/conversation-service/src/service"`
- Lines 24-29: Multiple job queue service implementations
- Line 33: `BaseEntityFormatter from "@brains/entity-service/src/service"`

#### 3. Type Instantiation Explosion

The circular dependencies combined with heavy Drizzle ORM types create millions of type instantiations that exhaust Node.js heap memory.

### Pattern Recognition

This is the same root cause that affected other packages:

- Content-service: Fixed by adding missing package dependencies (25s → 2.3s)
- MCP-service: Fixed by removing circular test imports (28s → 1.5s)
- Job-queue: Fixed by correcting test import patterns (1M+ instantiations → 2.4s)

But core is the most severe case due to importing from ALL services simultaneously.

## Solution Strategy

### Phase 1: Remove Heavy Service Imports

**Goal:** Replace concrete service class imports with lightweight interface imports

#### Changes Required:

```diff
# core/src/shell.ts
- import { EntityService } from "@brains/entity-service/src/service";
- import { JobQueueService, JobProgressMonitor, BatchJobManager, JobQueueWorker } from "@brains/job-queue/src/service";
+ import type { IEntityService } from "@brains/entity-service";
+ import type { IJobQueueService, IJobProgressMonitor, IBatchJobManager, IJobQueueWorker } from "@brains/job-queue";

# core/src/initialization/shellInitializer.ts
- import { EntityRegistry, EntityService } from "@brains/entity-service/src/service";
- import { ConversationService } from "@brains/conversation-service/src/service";
- import { JobQueueService, JobQueueWorker, BatchJobManager, JobProgressMonitor } from "@brains/job-queue/src/service";
- import { BaseEntityFormatter } from "@brains/entity-service/src/service";
+ import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
+ import type { IConversationService } from "@brains/conversation-service";
+ import type { IJobQueueService, IJobQueueWorker, IBatchJobManager, IJobProgressMonitor } from "@brains/job-queue";
+ import type { IBaseEntityFormatter } from "@brains/entity-service";
```

### Phase 2: Implement Dependency Injection Pattern

**Goal:** Core receives service instances rather than importing service classes

#### Current Pattern (Problematic):

```typescript
// Core imports and instantiates services directly
import { EntityService } from "@brains/entity-service/src/service";
const entityService = new EntityService(config);
```

#### New Pattern (Solution):

```typescript
// Core receives service instances via dependency injection
interface CoreDependencies {
  entityService: IEntityService;
  jobQueueService: IJobQueueService;
  // ... other services
}

class Core {
  constructor(private dependencies: CoreDependencies) {}
}
```

#### Implementation Steps:

1. Create `CoreDependencies` interface with all required services
2. Modify `Shell` class constructor to accept dependencies
3. Move service instantiation to external factory/initializer
4. Update shell initialization to pass service instances

### Phase 3: Verify Circular Dependency Resolution

**Goal:** Ensure clean dependency graph after changes

#### Verification Steps:

1. Confirm core only imports interfaces, not implementations
2. Verify no package imported by core also imports back to core
3. Check that plugins → services dependency doesn't conflict with core → services

### Phase 4: Testing & Validation

**Goal:** Ensure functionality preserved while fixing performance

#### Test Plan:

1. **Compilation Test:** `npx tsc --noEmit` should complete in ~2-3 seconds without memory errors
2. **Functionality Test:** All core features should work identically
3. **Dependency Verification:** No circular dependencies remain
4. **Performance Monitoring:** Track compilation times across all packages

## Expected Outcomes

### Before Fix:

- **Status:** JavaScript heap out of memory crash
- **Compilation Time:** Crashes before completion
- **Usability:** Core package completely broken

### After Fix:

- **Status:** Clean compilation
- **Compilation Time:** ~2-3 seconds (consistent with other packages)
- **Usability:** Fully functional with clean architecture

## Implementation Order

### Priority 1 (Critical - Fixes Memory Crash):

1. Remove heavy service imports from `core/src/shell.ts`
2. Remove heavy service imports from `core/src/initialization/shellInitializer.ts`
3. Replace with interface imports

### Priority 2 (Architecture Improvement):

1. Implement dependency injection pattern
2. Create service factory/initializer
3. Update core constructor

### Priority 3 (Validation):

1. Test compilation performance
2. Verify functionality preservation
3. Document new architecture pattern

## Risk Assessment

### Low Risk:

- Interface imports maintain type safety
- Dependency injection is a standard pattern
- Changes are isolated to core package

### Mitigation:

- Make changes incrementally
- Test compilation after each change
- Preserve all functionality through interfaces

## Success Criteria

✅ Core compilation completes without memory errors
✅ Compilation time under 5 seconds
✅ All core functionality preserved
✅ Clean dependency graph (no circular dependencies)
✅ Pattern documented for future reference
