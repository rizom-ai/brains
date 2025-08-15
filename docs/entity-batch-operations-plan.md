# Entity Service Batch Operations Plan

## Problem Statement

The current EntityService only supports single-entity operations, leading to performance bottlenecks when:

- Importing hundreds of files via directory-sync
- Syncing repositories via git-sync
- Generating embeddings for multiple entities
- Performing bulk updates or deletions

Each operation requires individual database transactions and API calls, resulting in poor performance and user experience for bulk operations.

## Goals

1. **Improve performance** for bulk operations by 10-100x
2. **Reduce API calls** for embedding generation through batching
3. **Simplify plugin code** by providing efficient batch primitives
4. **Maintain backward compatibility** with existing single-entity operations
5. **Provide clear error reporting** for partial failures

## Design Decisions

Based on architectural review and requirements analysis:

### 1. Naming Convention

**Decision**: Use plural naming for batch operations

- `createEntities()` instead of `batchCreate()` or `bulkCreate()`
- Consistent with existing `listEntities()` pattern
- Clear distinction: `createEntity()` vs `createEntities()`

### 2. Transaction Strategy

**Decision**: Partial success with detailed reporting

- NOT all-or-nothing transactions
- Return succeeded and failed items separately
- Allow users to retry only failed items
- Matches real-world sync scenarios

### 3. Embedding Generation

**Decision**: Flexible sync/async options

- Default: Synchronous (entities immediately searchable)
- Optional: Defer embeddings for large imports
- Optional: Skip embeddings entirely for archives

### 4. Upsert Support

**Decision**: Add `upsertEntities()` method

- Critical for sync operations (directory-sync, git-sync)
- Leverages SQLite's `INSERT OR REPLACE`
- Reduces roundtrips and complexity

### 5. Caching Strategy

**Decision**: Skip caching initially

- Focus on batch operations first
- Add caching later based on usage patterns
- Avoid premature optimization

## API Specification

### Core Types

```typescript
interface BatchResult<T> {
  succeeded: T[];
  failed: Array<{
    input: Partial<T>;
    error: string;
    index: number;
  }>;
  total: number;
  successCount: number;
  failureCount: number;
  jobId?: string; // For deferred embedding generation
}

interface BatchOptions {
  skipEmbeddings?: boolean; // Don't generate embeddings at all
  deferEmbeddings?: boolean; // Generate embeddings asynchronously
  chunkSize?: number; // Process in chunks (default: 100)
}
```

### EntityService Methods

```typescript
class EntityService {
  /**
   * Create multiple entities in batch
   * Uses partial success - returns both succeeded and failed
   */
  async createEntities<T extends BaseEntity>(
    entityType: string,
    entities: Partial<T>[],
    options?: BatchOptions,
  ): Promise<BatchResult<T>>;

  /**
   * Update multiple entities in batch
   */
  async updateEntities<T extends BaseEntity>(
    entityType: string,
    updates: Array<{
      id: string;
      data: Partial<T>;
    }>,
    options?: BatchOptions,
  ): Promise<BatchResult<T>>;

  /**
   * Delete multiple entities in batch
   */
  async deleteEntities(
    entityType: string,
    ids: string[],
  ): Promise<BatchResult<void>>;

  /**
   * Create or update entities based on ID existence
   * Perfect for sync operations
   */
  async upsertEntities<T extends BaseEntity>(
    entityType: string,
    entities: Partial<T>[],
    options?: BatchOptions,
  ): Promise<BatchResult<T>>;
}
```

### EmbeddingService Methods

```typescript
class EmbeddingService {
  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than multiple individual calls
   */
  async generateEmbeddings(texts: string[]): Promise<Float32Array[]>;

  /**
   * Queue embeddings for background generation
   * Returns immediately with a job ID
   */
  async queueEmbeddings(entityIds: string[], texts: string[]): Promise<string>;
}
```

## Implementation Phases

### Phase 1: Basic Batch CRUD (Week 1)

1. Implement `createEntities()` with validation
2. Implement `updateEntities()` with partial updates
3. Implement `deleteEntities()` with cascade handling
4. Add comprehensive tests
5. Benchmark performance improvements

### Phase 2: Upsert Operation (Week 1)

1. Implement `upsertEntities()` using SQLite's ON CONFLICT
2. Add transaction batching for performance
3. Test with large datasets
4. Document migration patterns

### Phase 3: Batch Embeddings (Week 2)

1. Modify AI service to support batch requests
2. Implement `generateEmbeddings()` with chunking
3. Add job queue integration for deferred processing
4. Implement progress tracking for large batches

### Phase 4: Plugin Migration (Week 2)

1. Update directory-sync to use batch operations
2. Update git-sync to use upsert
3. Measure and document performance improvements
4. Update plugin documentation

## Migration Guide

### For Plugin Developers

#### Before (Inefficient)

```typescript
// Directory sync - old way
for (const file of files) {
  try {
    const existing = await entityService.getEntity("file", file.id);
    if (existing) {
      await entityService.updateEntity("file", file.id, file);
    } else {
      await entityService.createEntity("file", file);
    }
  } catch (error) {
    errors.push({ file, error });
  }
}
```

#### After (Efficient)

```typescript
// Directory sync - new way
const result = await entityService.upsertEntities("file", files, {
  deferEmbeddings: true, // For large imports
});

if (result.failureCount > 0) {
  logger.warn(`Failed to sync ${result.failureCount} files`, result.failed);
}
```

### Backward Compatibility

All existing single-entity methods remain unchanged:

- `createEntity()` - still works, calls `createEntities()` internally
- `updateEntity()` - still works, calls `updateEntities()` internally
- `deleteEntity()` - still works, calls `deleteEntities()` internally

## Testing Strategy

### Unit Tests

- Test partial success scenarios
- Test validation with mixed valid/invalid data
- Test chunk processing for large batches
- Test embedding generation options

### Integration Tests

- Test with real database
- Test transaction rollback on database errors
- Test concurrent batch operations
- Test memory usage with large datasets

### Performance Tests

- Benchmark: 1, 10, 100, 1000, 10000 entities
- Compare single vs batch operations
- Measure memory consumption
- Test with and without embeddings

## Success Metrics

### Performance Targets

- **Batch creation**: 100x faster for 1000 entities
- **Embedding generation**: 10x fewer API calls
- **Memory usage**: < 100MB for 10,000 entities
- **Database operations**: < 10 queries for any batch size

### Quality Metrics

- **Test coverage**: > 90% for new code
- **Error handling**: 100% of failures reported with context
- **Documentation**: Complete API docs and migration guide
- **Plugin adoption**: Both sync plugins migrated

## Risks and Mitigations

### Risk 1: Memory exhaustion with huge batches

**Mitigation**: Implement automatic chunking with configurable size

### Risk 2: Long-running operations blocking event loop

**Mitigation**: Use async iterators and yield periodically

### Risk 3: Partial failures confusing users

**Mitigation**: Clear BatchResult type with detailed error messages

### Risk 4: Breaking existing plugins

**Mitigation**: Keep all existing methods, gradual migration

## Open Questions

1. Should we add a `validateEntities()` method for pre-validation?
2. Should chunk size be configurable per operation or global?
3. How should we handle rate limiting for embedding API?
4. Should we add progress callbacks for long operations?

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feature/entity-batch-operations`
3. Implement Phase 1: Basic batch CRUD
4. Benchmark and adjust based on results
5. Continue with subsequent phases

## References

- [SQLite Batch Insert Performance](https://www.sqlite.org/faq.html#q19)
- [Node.js Stream Processing](https://nodejs.org/api/stream.html)
- [Database Transaction Best Practices](https://www.postgresql.org/docs/current/transaction-iso.html)
