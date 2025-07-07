# Batch Progress Event System - Implementation Plan

## Overview
Implement a unified batch progress event system that emits real-time updates for all interfaces (Matrix, CLI, and MCP) to consume.

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

### 1. Create Unified Batch Progress Event System

Add batch progress monitoring to `PluginContextFactory`:
```typescript
// When enqueueBatch is called:
1. Enqueue the batch operations
2. Start monitoring the batch
3. Emit "batch-progress" events periodically
4. Stop monitoring when batch completes
```

### 2. Event Structure
```typescript
interface BatchProgressEvent {
  batchId: string;
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  currentOperation?: string;
  status: "pending" | "processing" | "completed" | "failed";
  errors?: string[];
}
```

### 3. Interface Implementations

#### Matrix (Event-based)
- Subscribe to "batch-progress" events
- Track message IDs for batch operations
- Edit messages in-place with progress updates
- Show formatted progress with emojis and percentages

#### CLI (Hybrid approach)
- Keep polling for discovery of new operations
- Subscribe to "batch-progress" events for real-time updates
- Reduce polling interval or make it configurable
- Update components reactively when events arrive

#### MCP (Enhanced with Streaming)
- Continue current request-based approach for single status checks
- Add streaming support for real-time updates:
  - **Option 1: Server-Sent Events (SSE)** - Simple, one-way streaming
  - **Option 2: Streamable HTTP Responses** - Using chunked transfer encoding
  - **Option 3: WebSocket** - Full duplex, but more complex
- Add a "stream" parameter to status tool for continuous updates

## Implementation Steps

### Phase 1: Core Event System
1. Add batch monitoring to `PluginContextFactory`
2. Emit standardized progress events through MessageBus
3. Handle cleanup and error cases

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
1. `/shell/core/src/plugins/pluginContextFactory.ts` - Add monitoring
2. `/interfaces/matrix/src/matrix-interface.ts` - Already updated
3. `/interfaces/cli/src/components/ActiveJobsTracker.tsx` - Add subscriptions
4. `/docs/batch-progress-events.md` - Document the system

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
- [x] Matrix client `editMessage` method
- [x] Matrix interface batch tracking and subscription logic
- [x] Planning documentation

### In Progress
- [ ] Batch monitoring in PluginContextFactory
- [ ] Event emission system

### Pending
- [ ] CLI interface event subscriptions
- [ ] Testing and refinement
- [ ] Time estimates for operations