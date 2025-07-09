# Directory Sync Plugin - Async Operations Enhancement Plan

## Current Implementation Analysis

### Current State

1. **Single Entity Operations**: Currently processes entities one at a time in `exportEntities()` and `importEntities()` methods
2. **EntityId to Folder Mapping**:
   - Base entities: `syncPath/{entityId}.md`
   - Other entities: `syncPath/{entityType}/{entityId}.md`
3. **Supported Operations**: sync, export, import, watch, status
4. **No Async Support**: No async operation infrastructure or TODO comments found

### Key Issues

1. **Performance**: Sequential processing of entities during export/import operations
2. **No Progress Tracking**: Users can't see progress for large operations
3. **Blocking Operations**: Export/import operations block until completion
4. **Limited Error Handling**: Errors are collected but not immediately visible

## Improvement Plan

### Phase 1: Add Async Entity Operations Support

1. **Create Async Job Handlers**:
   - `DirectoryExportJobHandler` - Handle async entity exports
   - `DirectoryImportJobHandler` - Handle async entity imports
   - Register handlers during plugin initialization

2. **Update Plugin to Use Async Operations**:
   - Modify export/import tools to use job queue
   - Return job IDs instead of blocking
   - Add progress tracking support

3. **Implement Chunked Processing Logic**:
   - Process entities in chunks (e.g., 100 at a time)
   - Provide progress visibility via job status
   - Handle errors gracefully without stopping entire operation

### Phase 2: Add Progress Monitoring

1. **Progress Events**:
   - Emit events for: operation started, progress update, operation completed
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

### 1. Create async job handlers:

```typescript
// Async export handler
export class DirectoryExportJobHandler
  implements JobHandler<"directory-export">
{
  async process(
    data: DirectoryExportJobData,
    jobId: string,
  ): Promise<ExportResult> {
    // Process entities in chunks
    // Track progress via job status
    // Return aggregate results
  }
}

// Async import handler
export class DirectoryImportJobHandler
  implements JobHandler<"directory-import">
{
  async process(
    data: DirectoryImportJobData,
    jobId: string,
  ): Promise<ImportResult> {
    // Process files in chunks
    // Track progress via job status
    // Return aggregate results
  }
}
```

### 2. Update Plugin Registration:

```typescript
// In plugin.ts onRegister()
if (context.registerJobHandler) {
  context.registerJobHandler("directory-export", new DirectoryExportJobHandler(...));
  context.registerJobHandler("directory-import", new DirectoryImportJobHandler(...));
}
```

### 3. Convert Tools to Async:

```typescript
// Update export tool
async (input, context) => {
  const jobId = await this.context.enqueueJob(
    "directory-export",
    { entityTypes: input.entityTypes },
    { source: "plugin:directory-sync" },
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
// In async handlers
const BATCH_SIZE = 100;
let offset = 0;

while (hasMore) {
  // Get batch of entities
  const entities = await this.context.entityService.listEntities(entityType, {
    limit: BATCH_SIZE,
    offset,
  });

  // Process batch in parallel
  const batchPromises = entities.map(async (entity) => {
    // Process individual entity
  });

  await Promise.all(batchPromises);

  offset += BATCH_SIZE;
  hasMore = entities.length === BATCH_SIZE;
}
```

## Benefits

- **Non-blocking Operations**: Better UX, no frozen interfaces
- **Progress Visibility**: Real-time operation tracking
- **Better Performance**: Parallel processing within chunks
- **Error Resilience**: Individual failures don't stop entire operation
- **Scalability**: Can handle large numbers of entities efficiently

## Next Steps

1. Implement async job handlers
2. Update plugin to register handlers
3. Convert tools to async pattern
4. Add progress tracking via job status
5. Test with large datasets
6. Update documentation

## Testing Strategy

### Unit Tests

- Test async handler logic with mock data
- Verify job completion and results
- Test error handling scenarios

### Integration Tests

- Test with large datasets (1000+ entities)
- Verify file system operations
- Test concurrent operations

### Performance Tests

- Measure improvement over sequential processing
- Monitor memory usage during async operations
- Test with various chunk sizes

## Migration Path

1. Add async handlers alongside existing sync methods
2. Update tools to use async pattern
3. Maintain backward compatibility initially
4. Deprecate synchronous methods in future release
