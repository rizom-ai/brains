# Directory Sync Plugin - Batch Operations Enhancement Plan

## Current Implementation Analysis

### Current State

1. **Single Entity Operations**: Currently processes entities one at a time in `exportEntities()` and `importEntities()` methods
2. **EntityId to Folder Mapping**:
   - Base entities: `syncPath/{entityId}.md`
   - Other entities: `syncPath/{entityType}/{entityId}.md`
3. **Supported Operations**: sync, export, import, watch, status
4. **No Batch Support**: No batch operation infrastructure or TODO comments found

### Key Issues

1. **Performance**: Sequential processing of entities during export/import operations
2. **No Progress Tracking**: Users can't see progress for large operations
3. **Blocking Operations**: Export/import operations block until completion
4. **Limited Error Handling**: Errors are collected but not immediately visible

## Improvement Plan

### Phase 1: Add Batch Entity Operations Support

1. **Create Batch Job Handlers**:
   - `BatchExportJobHandler` - Handle batch entity exports
   - `BatchImportJobHandler` - Handle batch entity imports
   - Register handlers during plugin initialization

2. **Update Plugin to Use Async Operations**:
   - Modify export/import tools to use job queue
   - Return job/batch IDs instead of blocking
   - Add progress tracking support

3. **Implement Batch Processing Logic**:
   - Process entities in chunks (e.g., 50 at a time)
   - Emit progress events via MessageBus
   - Handle errors gracefully without stopping entire batch

### Phase 2: Add Progress Monitoring

1. **Progress Events**:
   - Emit events for: batch started, progress update, batch completed
   - Include current/total counts and current operation details
2. **Status Tool Enhancement**:
   - Show detailed progress for running operations
   - Display error summaries if any operations fail

### Phase 3: Optimize File Operations

1. **Parallel Processing**:
   - Use Promise.all() for file I/O operations within chunks
   - Maintain reasonable concurrency limits
2. **Efficient Directory Scanning**:
   - Cache directory structure during operations
   - Batch file system operations where possible

## Implementation Details

### 1. Create `batchHandlers.ts`:

```typescript
// Batch export handler
export class BatchExportJobHandler
  implements JobHandler<"directory-sync:batch-export">
{
  async process(
    data: BatchExportData,
    jobId: string,
  ): Promise<BatchExportResult> {
    // Process entities in chunks
    // Emit progress events
    // Return aggregate results
  }
}

// Batch import handler
export class BatchImportJobHandler
  implements JobHandler<"directory-sync:batch-import">
{
  async process(
    data: BatchImportData,
    jobId: string,
  ): Promise<BatchImportResult> {
    // Process files in chunks
    // Emit progress events
    // Return aggregate results
  }
}
```

### 2. Update Plugin Registration:

```typescript
// In plugin.ts onRegister()
if (context.registerJobHandler) {
  context.registerJobHandler("batch-export", new BatchExportJobHandler(...));
  context.registerJobHandler("batch-import", new BatchImportJobHandler(...));
}
```

### 3. Convert Tools to Async:

```typescript
// Update export tool
async (input, context) => {
  const jobId = await this.context.enqueueJob(
    `${this.metadata.id}:batch-export`,
    { entityTypes: input.entityTypes },
    { source: context?.source || "plugin:directory-sync" },
  );

  return {
    status: "queued",
    message: "Export operation queued",
    jobId,
    tip: "Use the status tool to check progress",
  };
};
```

### 4. Add Chunked Processing:

```typescript
// In batch handlers
const CHUNK_SIZE = 50;
const chunks = chunk(entities, CHUNK_SIZE);

for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];

  // Process chunk in parallel
  const results = await Promise.all(
    chunk.map((entity) => this.processEntity(entity)),
  );

  // Emit progress
  await this.emitProgress(jobId, {
    current: (i + 1) * CHUNK_SIZE,
    total: entities.length,
    currentOperation: `Processing chunk ${i + 1}/${chunks.length}`,
  });
}
```

## Benefits

- **Non-blocking Operations**: Better UX, no frozen interfaces
- **Progress Visibility**: Real-time operation tracking
- **Better Performance**: Parallel processing within chunks
- **Error Resilience**: Individual failures don't stop entire batch
- **Scalability**: Can handle large numbers of entities efficiently

## Next Steps

1. Implement batch job handlers
2. Update plugin to register handlers
3. Convert tools to async pattern
4. Add progress event emission
5. Test with large datasets
6. Update documentation

## Testing Strategy

### Unit Tests

- Test batch handler logic with mock data
- Verify progress event emission
- Test error handling scenarios

### Integration Tests

- Test with large datasets (1000+ entities)
- Verify file system operations
- Test concurrent operations

### Performance Tests

- Measure improvement over sequential processing
- Monitor memory usage during batch operations
- Test with various chunk sizes

## Migration Path

1. Add batch handlers alongside existing sync methods
2. Update tools to use async pattern
3. Maintain backward compatibility initially
4. Deprecate synchronous methods in future release
