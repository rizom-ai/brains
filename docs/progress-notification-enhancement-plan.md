# Progress Notification Enhancement Plan

## Overview

This document outlines the plan to enhance progress notifications in the Personal Brain system, focusing on enabling granular progress reporting from job handlers while maintaining the clean architecture of the current implementation.

## Current State Analysis

### Progress Notification Flow

When a user triggers an async operation (e.g., `/generate-all` in CLI):

1. **Tool Execution**:
   - Tool returns: `{ status: "queued", batchId: "xyz", tip: "Use status tool..." }`
   - Job/batch is queued with source identifier (e.g., `"cli:channelId"`)

2. **Job Processing**:
   - JobQueueService processes jobs
   - BatchJobManager handles batch operations
   - Status updates stored in database with source field

3. **Progress Monitoring**:
   - JobProgressMonitor polls every 500ms
   - Detects status changes
   - Emits `"job-progress"` events via MessageBus with `target = source`

4. **Event Routing**:
   - MessageBus routes events to subscribers matching target pattern
   - Interfaces subscribe with patterns like `"cli:*"`, `"matrix:*"`
   - Events reach only the originating interface

5. **UI Updates**:
   - CLI: StatusBarWithProgress shows progress bar
   - Matrix: Messages edited with progress updates
   - MCP: notifications/progress sent to clients

### Architecture Strengths

- **Clean Separation**: Tools → Jobs → Monitor → Events → UI
- **Event Targeting**: Prevents cross-interface message pollution
- **Non-blocking**: Async operations don't freeze UI
- **Unified System**: Works across all interfaces

### Current Limitations

1. **No Granular Handler Progress**: Job handlers can't report detailed progress
2. **Polling Latency**: 500ms delay for status updates
3. **Limited Progress Info**: Only completion counts, no operation details
4. **MCP Disconnect**: MCP progressToken not integrated with job system
5. **EventEmitter Anti-pattern**: Interfaces use redundant EventEmitter instead of MessageBus directly

## Proposed Enhancements

### Phase 1: Enable Job Handler Progress Reporting

**Goal**: Allow job handlers to report granular progress during execution.

**Changes**:

1. Extend JobHandler interface:

   ```typescript
   interface JobHandler<TInput, TOutput> {
     process(
       data: TInput,
       jobId: string,
       progressReporter?: IProgressReporter,
     ): Promise<TOutput>;
   }
   ```

2. Implement IProgressReporter in JobQueueService:

   ```typescript
   class JobQueueService implements IProgressReporter {
     reportProgress(
       jobId: string,
       current: number,
       total: number,
       message?: string,
     ): void {
       // Forward to JobProgressMonitor
       this.progressMonitor.reportProgress(jobId, current, total, message);
     }
   }
   ```

3. Pass progressReporter to handlers:
   ```typescript
   // In JobQueueService.processJob()
   const result = await handler.process(jobData, job.id, this);
   ```

**Benefits**:

- Handlers can report: "Processing page 1/10: dashboard..."
- Real-time updates without polling delay
- Backward compatible (progressReporter is optional)

### Phase 2: Enhanced Progress Event Data

**Goal**: Provide richer progress information to interfaces.

**Changes**:

1. Extend JobProgressEvent schema:

   ```typescript
   {
     id: string;
     type: "job" | "batch";
     status: JobStatus;
     progress?: {
       current: number;
       total: number;
       percentage: number;
       eta?: number;         // New: estimated time remaining
       rate?: number;        // New: items per second
     };
     message?: string;         // Detailed status message
     operation?: string;       // New: current operation name
   }
   ```

2. Calculate progress metrics in JobProgressMonitor:
   - Track start times and calculate rates
   - Estimate completion time based on current rate
   - Include operation descriptions

**Benefits**:

- Better user feedback: "Generating content (3/10) - 2 min remaining"
- Progress rate visualization
- More informative status messages

### Phase 3: MCP Progress Integration

**Goal**: Enable MCP tools with progressToken to report progress.

**Changes**:

1. Tools with progressToken emit progress events:

   ```typescript
   if (progressToken) {
     await context.sendMessage(`plugin:${pluginId}:progress`, {
       progressToken,
       progress: { current: 1, total: 10 },
       message: "Processing...",
     });
   }
   ```

2. MCP interface already handles these events and sends notifications

**Benefits**:

- MCP clients get real-time progress
- Maintains separation between job queue and MCP progress
- Leverages existing MCP notification infrastructure

### Phase 4: UI Enhancements

**Goal**: Improve progress visualization across interfaces.

**CLI Enhancements**:

- Multi-line progress for batch operations
- Show current operation details
- ETA and rate display

**Matrix Enhancements**:

- Richer progress messages with operation details
- Emoji indicators for different operation types
- Completion summaries

### Phase 5: Remove EventEmitter Anti-pattern

**Goal**: Eliminate redundant EventEmitter layer in interfaces and use MessageBus directly.

**Current Problem**:

- MessageInterfacePlugin has its own EventEmitter
- Creates two-layer event system: MessageBus → EventEmitter → UI
- Results in awkward double event handling:
  ```typescript
  // Current anti-pattern
  context.subscribe("job-progress", async (message) => {
    // Validate and re-emit locally
    this.emit("job-progress", progressEvent, message.target);
  });
  ```

**Changes**:

1. Remove EventEmitter from MessageInterfacePlugin:

   ```typescript
   export abstract class MessageInterfacePlugin<TConfig = unknown>
     extends InterfacePlugin<TConfig>
     implements IMessageInterfacePlugin {
     // Remove: private eventEmitter: EventEmitter;
     // Remove: on(), off(), emit() methods
   }
   ```

2. Pass MessageBus access to UI components:

   ```typescript
   // CLI App component
   interface Props {
     interface: CLIInterface;
     messageBus: IMessageBus; // New: direct access
   }
   ```

3. UI components subscribe directly:
   ```typescript
   useEffect(() => {
     const unsubscribe = messageBus.subscribe(
       "job-progress",
       (message) => handleProgress(message),
       { target: `cli:${sessionId}` },
     );
     return unsubscribe;
   }, [messageBus, sessionId]);
   ```

**Benefits**:

- Single event system (MessageBus only)
- Type-safe event handling
- Simpler debugging and event tracing
- Reduced memory overhead
- Consistent event patterns

**Migration Notes**:

- Matrix interface already has TODO comment acknowledging this
- Each interface can be migrated independently
- Backward compatibility through adapter if needed

## Implementation Priority

1. **Phase 1** (High Priority): Job handler progress reporting
   - Biggest impact on user experience
   - Enables detailed progress for all async operations
   - Foundation for other enhancements

2. **Phase 5** (High Priority): Remove EventEmitter anti-pattern
   - Simplifies architecture significantly
   - Reduces technical debt
   - Makes event flow clearer and more maintainable
   - Should be done early to avoid building more features on flawed foundation

3. **Phase 2** (Medium Priority): Enhanced progress data
   - Builds on Phase 1
   - Provides richer feedback

4. **Phase 3** (Low Priority): MCP integration
   - Only affects MCP users
   - Can work independently

5. **Phase 4** (Medium Priority): UI improvements
   - Can be done incrementally
   - Each interface can enhance independently

## Architecture Decisions

### Why Keep Current Architecture

The current design correctly separates concerns:

- **Tools**: Initiate work, return immediately
- **Jobs**: Track execution state
- **Monitor**: Report progress changes
- **Events**: Route to correct interface
- **UI**: Display progress

### Why Not Direct Tool Progress

Direct tool progress would:

- Bypass centralized job monitoring
- Create inconsistency between sync/async operations
- Complicate the clean separation of concerns
- Require tools to manage progress state

### Event Targeting Strategy

Continue using source-based targeting:

- Jobs store originating interface as `source`
- Progress events use `target = source`
- Interfaces subscribe to their namespace (`cli:*`, `matrix:*`)
- Ensures progress reaches only the initiating interface

## Migration Strategy

1. **Backward Compatibility**: All changes are additive
   - Existing handlers continue to work
   - progressReporter parameter is optional
   - New event fields are optional

2. **Incremental Rollout**:
   - Start with high-value handlers (content generation, directory sync)
   - Add progress reporting to one handler at a time
   - Monitor performance impact

3. **Testing Strategy**:
   - Unit tests for progress reporting
   - Integration tests for event flow
   - Performance tests for high-frequency progress updates

## Success Metrics

- **User Experience**: Detailed progress instead of generic "Processing..."
- **Responsiveness**: Real-time updates vs 500ms polling delay
- **Information**: Operation details, ETA, completion rates
- **Performance**: No significant overhead from progress reporting

## Risks and Mitigations

**Risk**: High-frequency progress updates overwhelming the system

- **Mitigation**: Throttle progress updates to max 10/second per job

**Risk**: Breaking existing job handlers

- **Mitigation**: Optional progressReporter parameter, extensive testing

**Risk**: Event bus congestion

- **Mitigation**: Monitor event rates, implement backpressure if needed

## Conclusion

The proposed enhancements maintain the clean architecture while addressing the main limitation: lack of granular progress reporting from job handlers. By making the IProgressReporter available to handlers, we enable rich progress feedback without compromising the system's design principles.

The phased approach allows incremental implementation with immediate benefits from Phase 1, while maintaining backward compatibility throughout.
