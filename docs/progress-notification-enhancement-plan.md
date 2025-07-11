# Progress Notification Enhancement Plan

## Overview

This document outlines the plan to enhance progress notifications in the Personal Brain system, addressing both architectural improvements and user experience enhancements. The plan prioritizes removing technical debt before building new features.

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

1. **EventEmitter Anti-pattern**: Interfaces use redundant EventEmitter instead of MessageBus directly
2. **No Granular Handler Progress**: Job handlers can't report detailed progress
3. **Polling Latency**: 500ms delay for status updates
4. **Limited Progress Info**: Only completion counts, no operation details
5. **MCP Disconnect**: MCP progressToken not integrated with job system

## Proposed Enhancements

### Phase 1: Remove EventEmitter Anti-pattern

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

2. Pass MessageBus or PluginContext to UI components:

   ```typescript
   // CLI App component
   interface Props {
     interface: CLIInterface;
     context: PluginContext; // Provides subscribe method
   }
   ```

3. UI components subscribe directly:
   ```typescript
   useEffect(() => {
     const unsubscribe = context.subscribe(
       "job-progress",
       (message) => handleProgress(message.payload),
       { target: `cli:${sessionId}` },
     );
     return unsubscribe;
   }, [context, sessionId]);
   ```

**Matrix-Specific Considerations**:

Matrix has unique requirements that need special handling:

1. **Message Editing**: Matrix tracks progress messages to edit them in-place

   ```typescript
   class MatrixInterface {
     // Currently uses EventEmitter + Map to track message IDs
     private progressMessages = new Map<string, string>();

     // After refactor: Direct MessageBus subscription
     private setupProgressHandlers(): void {
       this.context.subscribe("job-progress", async (message) => {
         const progressEvent = message.payload;
         const roomId = this.extractRoomIdFromTarget(message.target);

         // Edit existing message or send new one
         const messageId = this.progressMessages.get(progressKey);
         if (messageId) {
           await this.client.editMessage(roomId, messageId, text);
         } else {
           const newId = await this.client.sendMessage(roomId, text);
           this.progressMessages.set(progressKey, newId);
         }
       });
     }
   }
   ```

2. **Room ID Extraction**: Matrix needs to parse targets like `"matrix:!roomId:homeserver"`

3. **Different Event Handling**:
   - Job events: Send completion messages only
   - Batch events: Edit messages to show progress

4. **State Management**: Must maintain message ID mapping without EventEmitter

**Benefits**:

- Single event system (MessageBus only)
- Type-safe event handling
- Simpler debugging and event tracing
- Reduced memory overhead
- Consistent event patterns
- Prevents building more features on flawed foundation

### Phase 2: Enable Job Handler Progress Reporting

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
- Foundation for rich progress feedback

### Phase 3: Enhanced Progress Events & Real-time Updates

**Goal**: Provide richer progress information and eliminate polling delays.

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

2. Real-time progress updates:
   - When handlers call progressReporter, emit event immediately
   - Keep polling as fallback for handlers that don't report progress
   - Hybrid approach ensures all jobs show progress

3. Calculate progress metrics in JobProgressMonitor:
   - Track start times and calculate rates
   - Estimate completion time based on current rate
   - Include operation descriptions

**Benefits**:

- Better user feedback: "Generating content (3/10) - 2 min remaining"
- Progress rate visualization
- More informative status messages
- Eliminates delay for handler-reported progress

### Phase 4: UI Enhancements

**Goal**: Improve progress visualization across interfaces.

**CLI Enhancements**:

- Multi-line progress for batch operations
- Show current operation details
- ETA and rate display
- Different rendering for batch vs individual jobs:
  - Individual jobs: Show single progress bar with operation details
  - Batch jobs: Show aggregated progress (e.g., "Processing files: 3/40")
- Smart aggregation for directory sync:
  - Instead of showing each file individually
  - Show total progress: "Syncing: 15/40 files processed"
  - Current file name below progress bar

**Matrix Enhancements**:

- Richer progress messages with operation details
- Emoji indicators for different operation types
- Completion summaries
- Improved message editing for smoother updates
- Batched updates to reduce message edit spam
- Thread support for grouping related operations
- Similar batch vs individual job differentiation

### Phase 5: MCP Progress Integration

**Goal**: Enable MCP tools with progressToken to report progress.

**Current State**:

- MCP interface already subscribes to `plugin:*:progress` events and forwards to MCP clients ✅
- BasePlugin provides `sendProgress` callback to tools when `progressToken` is present ✅
- **Gap**: Job-based tools can't report progress via MCP progressToken

**Changes Needed**:

1. Bridge job queue progress to MCP progress events:

   ```typescript
   // In BasePlugin - create a bridge for job-based tools
   protected createProgressBridge(progressToken?: string | number): IProgressReporter | undefined {
     if (!progressToken || !this.context) return undefined;

     return ProgressReporter.from(async (notification) => {
       await this.context!.sendMessage(`plugin:${this.id}:progress`, {
         progressToken,
         notification: {
           progress: notification.progress,
           total: notification.total,
           message: notification.message,
         }
       });
     });
   }
   ```

2. Update job-based tools to use the bridge:

   ```typescript
   // In tool handler
   async (input, context) => {
     const progressReporter = this.createProgressBridge(context?.progressToken);

     const jobId = await this.context.enqueueJob("job-type", data, {
       progressReporter, // Pass to job handler
     });

     return { status: "queued", jobId };
   };
   ```

3. Enhance job handlers to accept optional progressReporter:

   ```typescript
   // Job metadata includes progressReporter
   interface JobMetadata {
     progressReporter?: IProgressReporter;
     // ... other fields
   }
   ```

**Benefits**:

- MCP clients get real-time progress from job-based tools
- Unified progress reporting across direct and job-based tools
- No changes needed to MCP interface (already handles progress events)
- Backward compatible - progressReporter is optional

## Implementation Status

### ✅ Completed

1. **Phase 1: Remove EventEmitter anti-pattern** ✅
   - Removed EventEmitter from MessageInterfacePlugin
   - Interfaces now use callback pattern instead
   - Clean single event system via MessageBus

2. **Phase 2: Enable Job Handler Progress Reporting** ✅
   - JobHandler interface extended with progressReporter
   - IProgressReporter implemented in JobProgressMonitor
   - Handlers can report granular progress

3. **Phase 3: Enhanced Progress Events & Real-time Updates** ✅
   - Extended JobProgressEvent schema with eta, rate, operation
   - Real-time progress updates when handlers report
   - Immediate completion event emission
   - 400ms minimum display duration in UI

4. **Phase 3.5: Remove IEventEmitter Abstraction** ✅
   - Removed unnecessary IEventEmitter interface from JobProgressMonitor
   - Pass MessageBus directly instead of through MessageBusAdapter
   - Deleted MessageBusAdapter as it's no longer needed
   - Updated JobProgressMonitor to call `messageBus.send()` directly
   - Consistent with Phase 1 EventEmitter removal
   - **Issue Discovered**: Current broadcast+target pattern is architecturally inconsistent

5. **Phase 3.6: Fix Progress Event Routing Architecture** ✅
   - **Problem**: Current pattern uses `broadcast=true` with specific `target`, which is contradictory
   - **Root Cause**: Interfaces subscribe to all events then filter client-side instead of using MessageBus routing
   - **Solution**: Eliminate target parameter entirely and use job metadata for routing
   - **Changes Completed**:
     - Updated CLI interface to subscribe with `{ target: "cli:*" }` pattern
     - Updated Matrix interface to subscribe with `{ target: "matrix:*" }` pattern
     - Removed client-side target filtering from interfaces
     - Changed JobProgressMonitor to use direct targeting (`broadcast=false`)
   - **Enhanced Solution**: Job metadata routing approach
     - Added `metadata` field to JobProgressEventSchema with optional `roomId`
     - Job creation includes routing metadata instead of source strings
     - Progress events include metadata directly in payload
     - Interfaces filter based on event.metadata.roomId matching their context
     - Eliminates target string parsing and provides better type safety
   - **Benefits**: Better performance, clearer architecture, consistent with MessageBus design, improved type safety
   - **Final Implementation**: Changed to broadcast=true with noop responses for broadcast handlers
     - Extended MessageResponse type with `{ noop: true }` variant
     - All interfaces filter by `interfaceId` in metadata
     - Fixed MessageBus test types to handle new response variant

### 📋 To Do

6. **Phase 4: UI Enhancements**
   - Multi-line progress for batch operations
   - Show current operation details
   - ETA and rate display
   - **NEW: Differentiate batch vs individual job rendering**
     - Check event.type to determine rendering style
     - Batch: Show aggregated count and overall progress
     - Individual: Show detailed operation with progress bar
   - **NEW: Aggregate directory sync progress (e.g., 3/40 files)**
     - Directory sync emits batch events with total file count
     - Show "Syncing: X/Y files" instead of individual file progress
     - Display current file being processed as subtitle

7. **Phase 5: MCP Progress Integration**
   - **Current State**:
     - MCP interface already handles `progressToken` and forwards progress to clients ✅
     - BasePlugin provides `sendProgress` callback when `progressToken` present ✅
     - Tools receive routing metadata (`interfaceId`, `userId`, `roomId`) ✅
     - **Gap**: Job-based tools can't report progress via MCP `progressToken`
     - **Key Insight**: All tools that need progress tracking are job-based (no synchronous tools need progress)
   - **Simplified Implementation**:

     a) **MCP subscribes to job-progress events**:

     ```typescript
     // In MCP's onRegister method
     context.subscribe("job-progress", async (message) => {
       const event = message.payload as JobProgressEvent;

       // Check if this job has an active MCP progress subscription
       const progressToken = event.metadata?.progressToken;
       if (progressToken && this.activeProgressTokens.has(progressToken)) {
         // Transform job progress to MCP format and send to client
         await this.sendProgressToClient(progressToken, {
           progress: event.progress?.current,
           total: event.progress?.total,
           message: event.message || event.operation,
         });
       }

       return { noop: true };
     });
     ```

     b) **Track active progressTokens**:

     ```typescript
     // When tool is called with progressToken
     if (progressToken) {
       this.activeProgressTokens.add(progressToken);
     }

     // When tool completes or aborts
     this.activeProgressTokens.delete(progressToken);
     ```

     c) **Tools already pass progressToken in job metadata**:

     ```typescript
     // Existing pattern in tools
     const jobId = await this.context.enqueueJob("job-type", data, {
       metadata: {
         progressToken: context?.progressToken,
         interfaceId: context?.interfaceId,
         userId: context?.userId,
         roomId: context?.roomId,
       },
     });
     ```

   - **Benefits**:
     - Zero changes to JobProgressMonitor or tools
     - Reuses existing job-progress infrastructure
     - Single event stream for all progress
     - Simple mental model
     - Backward compatible

8. **Phase 6: Clean up unused progress infrastructure**
   - **Current State**:
     - `plugin:${pluginId}:progress` channel exists but is unused (all progress goes through job-progress)
     - `context.sendProgress` callback in tools is unused
     - BasePlugin has progress event handling that's never triggered
   - **Cleanup Tasks**:

     a) **Remove unused progress subscription in MCP**:

     ```typescript
     // Remove this entire block from MCP tool handler
     unsubscribe = this.context.subscribe(
       `plugin:${pluginId}:progress`,
       async (message) => { ... }
     );
     ```

     b) **Simplify BasePlugin tool context**:

     ```typescript
     // Remove sendProgress when no progressToken
     const toolContext = {
       progressToken,
       // Remove: sendProgress callback
       interfaceId,
       userId,
       roomId,
     };
     ```

     c) **Remove progressMessageSchema** from MCP interface

     d) **Update documentation** to reflect that all progress goes through job-progress

   - **Benefits**:
     - Simpler codebase
     - Less confusion about progress flow
     - Smaller message bus traffic
     - Clear architectural pattern: all async operations use jobs

## Architecture Decisions

### Progress Event Routing Pattern Issue (Discovered in Phase 3.5)

During Phase 3.5, we discovered an architectural inconsistency in the progress event routing:

**Current Pattern (Problematic)**:

```typescript
// JobProgressMonitor sends with contradictory parameters
await this.messageBus.send(
  "job-progress",
  event,
  "job-progress-monitor",
  target, // specific target
  undefined,
  true, // broadcast to all - contradictory!
);

// Interfaces subscribe to ALL events without target filter
context.subscribe("job-progress", handler);

// Then filter client-side
if (target && !target.startsWith("cli:")) return;
```

**Problems**:

- Broadcast + specific target is conceptually contradictory
- All events go to all interfaces, then get filtered client-side
- Inefficient and architecturally unclear
- Goes against MessageBus design principles

**Updated Pattern (Metadata-based)**:

```typescript
// JobProgressMonitor sends without target, includes metadata in payload
await this.messageBus.send(
  "job-progress",
  {
    ...event,
    metadata: { roomId: extractedRoomId },
  },
  "job-progress-monitor",
  undefined, // no target
  undefined,
  false, // direct targeting to all subscribers
);

// Interfaces subscribe without target filters
context.subscribe("job-progress", handler);

// Filter based on metadata in handler
if (event.metadata?.roomId === this.sessionId) {
  // Handle event
}
```

**Benefits**:

- Events only go where they're needed (performance)
- Clear, intuitive routing semantics
- Consistent with MessageBus design
- Easier to debug and understand

### Why Remove EventEmitter First

- Technical debt compounds - the longer we wait, the more code depends on it
- Every new feature built on EventEmitter needs migration later
- Clean architecture enables better implementations of subsequent phases
- Reduces complexity for developers working on interfaces

### Why Keep Current Job Queue Architecture

The current design correctly separates concerns:

- **Tools**: Initiate work, return immediately
- **Jobs**: Track execution state
- **Monitor**: Report progress changes
- **Events**: Route to correct interface
- **UI**: Display progress

### Event Targeting Strategy

Updated to use metadata-based routing:

- Jobs store routing information in metadata: `{ roomId: "channelId" }`
- Progress events include metadata directly in payload
- Interfaces subscribe without target filters and filter based on metadata
- Each interface checks if event.metadata.roomId matches their context
- Eliminates target string parsing and provides better type safety

## Migration Strategy

### Phase 1 Migration (EventEmitter Removal)

#### General Approach

1. Create adapter layer for backward compatibility
2. Update one interface at a time (CLI first, then Matrix)
3. Remove EventEmitter once all interfaces migrated
4. Update tests to use MessageBus directly

#### CLI Migration (Simpler)

- Pass PluginContext to React components via props
- Update useEffect hooks to use context.subscribe directly
- Remove re-emission logic from cli-interface.ts

#### Matrix Migration (More Complex)

- **Challenge**: Matrix needs stateful message tracking for editing
- **Solution**: Keep progressMessages Map, but subscribe directly to MessageBus
- **Steps**:
  1. Replace setupProgressHandlers to use context.subscribe
  2. Move room ID extraction logic into subscription handlers
  3. Maintain message ID tracking without EventEmitter
  4. Test message editing functionality thoroughly
- **Special Care**: Matrix's TODO comment shows awareness of the issue

### Phase 2+ Migration

1. All changes are additive
2. Existing handlers continue to work
3. New features are opt-in
4. Monitor performance impact

## Success Metrics

- **Code Quality**: Reduced abstraction layers, cleaner event flow
- **User Experience**: Detailed progress instead of generic "Processing..."
- **Responsiveness**: Real-time updates vs 500ms polling delay
- **Information**: Operation details, ETA, completion rates
- **Performance**: No significant overhead from progress reporting

## Risks and Mitigations

**Risk**: Breaking existing interfaces during EventEmitter removal

- **Mitigation**: Careful testing, adapter layer, incremental migration

**Risk**: High-frequency progress updates overwhelming the system

- **Mitigation**: Throttle progress updates to max 10/second per job

**Risk**: Breaking existing job handlers

- **Mitigation**: Optional progressReporter parameter, extensive testing

## Conclusion

By prioritizing the removal of the EventEmitter anti-pattern, we ensure a clean foundation for building enhanced progress notifications. The phased approach allows incremental implementation while maintaining backward compatibility, with immediate benefits from addressing technical debt in Phase 1.
