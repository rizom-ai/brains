# DirectorySync and EntityService Patterns Plan

## Overview

This plan captures patterns and improvements identified while analyzing DirectorySync as a heavy EntityService user. The goal is to consolidate common patterns and simplify plugin interactions with entities.

## Identified Patterns

### 1. ✅ Upsert Pattern (COMPLETED)
**Pattern:** Check if entity exists, then create or update
**Solution:** Added `upsertEntity` method to EntityService
**Impact:** Reduced ~30 lines to ~10 lines in DirectorySync

### 2. Batch Processing Pattern
**Current State:**
- DirectorySync processes entities one by one in loops
- Each operation is independent but sequential
- No progress reporting for large operations

**Proposed Solution:**
```typescript
// Add to EntityService
batchCreateEntities<T extends BaseEntity>(
  entities: T[],
  options?: { batchSize?: number; onProgress?: (progress: number) => void }
): Promise<BatchResult>;

batchUpdateEntities<T extends BaseEntity>(
  entities: T[],
  options?: { batchSize?: number; onProgress?: (progress: number) => void }
): Promise<BatchResult>;
```

### 3. ✅ Timestamp Preservation Issue (COMPLETED)
**Problem:** File timestamps not preserved, causing unnecessary re-syncs
**Solution:** Added `utimesSync` to preserve entity timestamps on files

### 4. Content Change Detection
**Current Issue:**
- DirectorySync only compares timestamps
- Content changes without timestamp changes are missed
- Identical content with newer timestamps triggers unnecessary updates

**Proposed Solutions:**

#### Option A: Content Hash Comparison
```typescript
// Add to BaseEntity
contentHash?: string;

// EntityService generates hash on create/update
// DirectorySync compares hashes before deciding to sync
```

#### Option B: Smart Update Method
```typescript
// Add to EntityService
updateEntityIfChanged<T extends BaseEntity>(
  entity: T,
  options?: { compareFields?: string[]; skipEmbedding?: boolean }
): Promise<{ entityId: string; jobId?: string; changed: boolean }>;
```

### 5. Selective Field Updates
**Current Issue:**
- `updateEntity` always updates all fields
- Always triggers embedding regeneration
- No way to update metadata without touching content

**Proposed Solution:**
```typescript
// Add to EntityService
updateEntityFields<T extends BaseEntity>(
  entityType: string,
  id: string,
  fields: Partial<T>,
  options?: { skipEmbedding?: boolean }
): Promise<{ entityId: string; jobId?: string }>;
```

### 6. Sync State Management
**Current Issue:**
- No way to track what's been synced
- Each sync re-processes everything
- No incremental sync capability

**Proposed Solution:**
```typescript
// Add sync metadata to entities
interface SyncMetadata {
  lastSyncedAt?: string;
  syncSource?: string;
  syncHash?: string;
}

// Add to EntityService
getEntitiesModifiedSince(
  entityType: string,
  since: Date,
  options?: QueryOptions
): Promise<T[]>;
```

## Implementation Priority

### Phase 1: Core Improvements (1-2 days)
1. ~~✅ Implement upsertEntity~~ (DONE)
2. ~~✅ Fix timestamp preservation~~ (DONE)
3. Implement updateEntityIfChanged with content comparison
4. Add updateEntityFields for selective updates

### Phase 2: Batch Operations (1 day)
1. Implement batchCreateEntities
2. Implement batchUpdateEntities  
3. Update DirectorySync to use batch operations
4. Add progress reporting

### Phase 3: Sync Optimization (2 days)
1. Add content hash generation to EntityService
2. Implement hash-based change detection
3. Add sync metadata support
4. Implement incremental sync in DirectorySync

### Phase 4: Performance & Monitoring (1 day)
1. Add metrics for sync operations
2. Implement dry-run mode for DirectorySync
3. Add conflict resolution strategies
4. Optimize embedding generation triggers

## Expected Outcomes

### Before:
- Every sync regenerates embeddings
- No batch processing
- Timestamp-only change detection
- Complex upsert logic in plugins

### After:
- Smart change detection (content-based)
- Efficient batch operations
- Selective field updates
- Simplified plugin code
- Reduced embedding regeneration

## Success Metrics
- 80% reduction in unnecessary embedding jobs
- 50% faster sync operations for large datasets
- Simplified plugin code (less boilerplate)
- Better resource utilization

## Next Steps
1. Implement updateEntityIfChanged method
2. Add content hash support to BaseEntity
3. Update DirectorySync to use new methods
4. Add comprehensive tests