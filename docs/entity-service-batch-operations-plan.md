# EntityService Batch Operations Implementation Plan

## Problem Statement

DirectorySync (and likely other plugins) suffer from N+1 query patterns when processing multiple entities. Each entity requires:

1. A database query to check existence
2. A database operation to create/update
3. Individual serialization/deserialization

For 1000 entities, this means 2000+ database round trips.

## Proposed Solution

Add batch operations to EntityService that maintain the same guarantees as individual operations but process multiple entities efficiently.

## Core Batch Operations

### 1. Batch Get Entities

```typescript
interface EntityIdentifier {
  entityType: string;
  id: string;
}

// Add to EntityService
async batchGetEntities<T extends BaseEntity>(
  identifiers: EntityIdentifier[]
): Promise<Map<string, T | null>> {
  // Single query: WHERE (entityType, id) IN ((type1, id1), (type2, id2), ...)
  // Returns a Map for O(1) lookup
}
```

### 2. Batch Upsert Entities

```typescript
interface BatchUpsertResult {
  succeeded: Array<{ entityId: string; jobId: string; created: boolean }>;
  failed: Array<{ entityId: string; error: Error }>;
}

// Add to EntityService
async batchUpsertEntities<T extends BaseEntity>(
  entities: T[],
  options?: {
    batchSize?: number;
    skipEmbedding?: boolean;
    onProgress?: (progress: number) => void;
  }
): Promise<BatchUpsertResult> {
  // Process in transaction batches
  // Queue embedding jobs in bulk
  // Report progress
}
```

### 3. Batch Existence Check (Lightweight)

```typescript
// Add to EntityService
async checkEntitiesExist(
  identifiers: EntityIdentifier[]
): Promise<Set<string>> {
  // Returns Set of IDs that exist
  // More efficient than full entity fetch
}
```

## Implementation Strategy

### Phase 1: Database Layer (2 days)

1. Implement efficient batch queries in entity service
2. Use database-specific optimizations (e.g., PostgreSQL's `unnest` for batch operations)
3. Ensure transaction safety for batch operations

### Phase 2: Embedding Job Batching (1 day)

1. Create batch embedding job type
2. Modify EmbeddingJobHandler to process multiple entities
3. Optimize embedding service for batch processing

### Phase 3: Update DirectorySync (1 day)

1. Replace loops with batch operations
2. Add progress reporting
3. Implement parallel file I/O

### Phase 4: Testing & Optimization (1 day)

1. Performance benchmarks
2. Error handling for partial batch failures
3. Memory usage optimization for large batches

## Expected Performance Gains

### Current Performance (1000 entities):

- 1000 getEntity queries
- 1000 upsert operations
- 1000 embedding jobs queued individually
- Total: ~2000+ database round trips

### With Batch Operations (1000 entities, batch size 100):

- 10 batch get queries
- 10 batch upsert operations
- 10 batch embedding jobs
- Total: ~20 database round trips (100x reduction)

## Design Considerations

### 1. Batch Size Limits

- Default: 100 entities per batch
- Configurable based on entity size
- Prevent memory exhaustion

### 2. Transaction Management

- Each batch in its own transaction
- Rollback on batch failure
- Report partial successes

### 3. Progress Reporting

- Essential for long-running operations
- Allows UI feedback
- Enables operation cancellation

### 4. Error Handling

```typescript
// Batch operations should return detailed results
{
  succeeded: [...],
  failed: [
    { entityId: "123", error: ValidationError },
    { entityId: "456", error: DatabaseError }
  ]
}
```

## Migration Path

1. Add new batch methods without breaking existing API
2. Update DirectorySync to use batch operations
3. Monitor performance improvements
4. Gradually migrate other plugins

## Success Metrics

- 90%+ reduction in database round trips for bulk operations
- 50%+ reduction in sync time for large directories
- No increase in error rates
- Memory usage stays within reasonable bounds

## Alternative Approaches Considered

1. **Streaming API**: More complex, not needed for current use cases
2. **Lazy Loading**: Doesn't solve the write-side performance issues
3. **Caching Layer**: Adds complexity, cache invalidation challenges

## Next Steps

1. Implement `batchGetEntities` as proof of concept
2. Benchmark performance improvements
3. Design batch embedding job format
4. Implement full batch operation suite

## Roadmap Priority

**Timeline: Future optimization phase**

This is marked for implementation after core functionality is stable and when performance optimization becomes a priority. Current single-entity operations are sufficient for MVP and early usage patterns.
