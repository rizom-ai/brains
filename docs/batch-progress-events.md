# Job Progress Event System - Implementation Plan

## Overview

Implement a unified job and batch progress event system that emits real-time updates for both individual long-running jobs and batch operations. All interfaces (Matrix, CLI, and MCP) can consume these events for real-time progress tracking.

## Current State Analysis

### CLI Interface

- **Polling-based**: Uses `ActiveJobsTracker` component that polls every 1 second
- Calls `getActiveJobs()` and `getActiveBatches()` repeatedly
- Updates UI with `BatchProgress` component
- No event-based updates

### MCP Interface

- **Request-based**: Only shows status when explicitly requested via `shell:status` tool
- No real-time updates
- Returns JSON response with batch status

### Matrix Interface

- **No progress tracking**: Currently has no batch progress visibility
- We've already added `editMessage` capability
- Ready for event-based updates

## Proposed Architecture

### 1. Create Unified Job Progress Event System

The `JobProgressMonitor` service in the job-queue package monitors both:

- Individual long-running jobs that can report progress
- Batch operations containing multiple jobs

```typescript
// JobProgressMonitor polls for:
1. Active jobs from JobQueueService
2. Active batches from BatchJobManager
3. Progress reports from job handlers
4. Emits unified "job-progress" events
```

### 2. Event Structure

```typescript
interface JobProgressEvent {
  // Common fields
  id: string; // jobId or batchId
  type: "job" | "batch";
  status: "pending" | "processing" | "completed" | "failed";
  message?: string;

  // Progress tracking
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };

  // Batch-specific fields
  batchDetails?: {
    totalOperations: number;
    completedOperations: number;
    failedOperations: number;
    currentOperation?: string;
    errors?: string[];
  };

  // Job-specific fields
  jobDetails?: {
    jobType: string;
    priority: number;
    retryCount: number;
  };
}
```

### 3. Progress Reporting API

Job handlers can report progress during execution:

```typescript
interface IProgressReporter {
  reportProgress(
    jobId: string,
    current: number,
    total: number,
    message?: string,
  ): void;
}

// Example usage in a job handler:
class SiteBuildJobHandler implements JobHandler {
  async process(
    data: SiteBuildJobData,
    jobId: string,
  ): Promise<SiteBuildJobResult> {
    const pages = await this.getPages();

    for (let i = 0; i < pages.length; i++) {
      // Report progress
      this.progressReporter.reportProgress(
        jobId,
        i + 1,
        pages.length,
        `Building ${pages[i].name}`,
      );

      await this.buildPage(pages[i]);
    }
  }
}
```

### 4. Interface Implementations

#### Matrix (Event-based)

- Subscribe to "job-progress" events
- Track message IDs for operations that return jobId or batchId
- Edit messages in-place with progress updates
- Show formatted progress with emojis and percentages
- Handle both individual job and batch progress

#### CLI (Hybrid approach)

- Keep polling for discovery of new operations
- Subscribe to "job-progress" events for real-time updates
- Reduce polling interval or make it configurable
- Update components reactively when events arrive
- Display different UI for jobs vs batches

#### MCP (Enhanced with Streaming)

- Continue current request-based approach for single status checks
- Add streaming support for real-time updates:
  - **Option 1: Server-Sent Events (SSE)** - Simple, one-way streaming
  - **Option 2: Streamable HTTP Responses** - Using chunked transfer encoding
  - **Option 3: WebSocket** - Full duplex, but more complex
- Add a "stream" parameter to status tool for continuous updates
- Stream both job and batch progress events

## Implementation Steps

### Phase 1: Core Event System

1. ✅ Create `JobProgressMonitor` in job-queue package
2. ✅ Support both individual jobs and batch operations
3. ✅ Implement progress reporting API for job handlers
4. ✅ Write comprehensive tests
5. Integrate with Shell to start monitoring service
6. Create MessageBus adapter for IEventEmitter interface

### Phase 2: Matrix Interface

1. ✅ Already added `editMessage` to client
2. ✅ Already added progress subscription logic
3. Test and refine message formatting

### Phase 3: CLI Interface Enhancement

1. Add event subscription to `ActiveJobsTracker`
2. Merge polling data with event updates
3. Optimize update frequency

### Phase 4: MCP Interface Streaming

1. Implement streaming HTTP response for batch progress
2. Add "stream" parameter to shell:status tool
3. Use chunked transfer encoding to send progress updates
4. Format updates as newline-delimited JSON (NDJSON)

## Benefits

- **Unified System**: Single source of progress events
- **Real-time Updates**: All interfaces get immediate updates
- **Reduced Polling**: CLI can reduce polling frequency
- **Better UX**: Users see progress without repeatedly checking
- **Extensible**: Easy to add progress to new interfaces

## Technical Considerations

1. **Event Rate Limiting**: Emit events max every 500ms to avoid spam
2. **Memory Management**: Clean up completed batch monitors
3. **Error Handling**: Gracefully handle monitoring failures
4. **Performance**: Minimal overhead for non-UI operations

## File Changes Required

1. ✅ `/shell/job-queue/src/job-progress-monitor.ts` - Created monitor service
2. ✅ `/shell/job-queue/test/job-progress-monitor.test.ts` - Added tests
3. ✅ `/shell/job-queue/src/index.ts` - Export new types
4. `/shell/core/src/shell.ts` - Integrate and start monitor
5. ✅ `/interfaces/matrix/src/matrix-interface.ts` - Already updated
6. ✅ `/interfaces/matrix/src/client/matrix-client.ts` - Added editMessage
7. `/interfaces/cli/src/components/ActiveJobsTracker.tsx` - Add event subscriptions
8. `/interfaces/mcp/src/mcp-interface.ts` - Add streaming support
9. ✅ `/docs/batch-progress-events.md` - Document the system

## MCP Streaming Implementation Details

### Streamable HTTP Response Approach

For MCP, we'll use chunked HTTP responses to stream progress updates:

```typescript
// Example usage from client:
// shell:status --batchId=batch-123 --stream=true

// Server response:
// HTTP/1.1 200 OK
// Transfer-Encoding: chunked
// Content-Type: application/x-ndjson

// Each chunk is a JSON object followed by newline:
{"batchId":"batch-123","status":"processing","completedOperations":1,"totalOperations":10}
{"batchId":"batch-123","status":"processing","completedOperations":2,"totalOperations":10}
{"batchId":"batch-123","status":"processing","completedOperations":3,"totalOperations":10}
...
{"batchId":"batch-123","status":"completed","completedOperations":10,"totalOperations":10}
```

### Implementation in MCP Interface

1. Modify the `shell:status` tool to accept a `stream` parameter
2. When `stream=true`:
   - Subscribe to "batch-progress" events for the specified batch
   - Stream each event as a JSON line
   - Close the stream when batch completes
3. Use proper chunked encoding headers
4. Handle client disconnection gracefully

### Benefits of Streamable HTTP

- **Simple**: Works with standard HTTP clients
- **Compatible**: MCP protocol supports streaming responses
- **Efficient**: Low overhead, no polling needed
- **Real-time**: Updates arrive as they happen

## Implementation Status

### Completed

- [x] JobProgressMonitor service implementation
- [x] Support for both individual jobs and batch operations
- [x] Progress reporting API (IProgressReporter)
- [x] Comprehensive test suite
- [x] Matrix client `editMessage` method
- [x] Matrix interface batch tracking and subscription logic
- [x] Planning documentation

### In Progress

- [ ] Shell integration (start monitor service)
- [ ] MessageBus adapter for IEventEmitter

### Pending

- [ ] Job handlers implementing progress reporting
- [ ] CLI interface event subscriptions
- [ ] MCP streaming implementation
- [ ] End-to-end testing
- [ ] Time estimates for operations
