# Universal Progress Event Routing Architecture

## Executive Summary

This document outlines the architectural solution for progress event routing across all interfaces in the Personal Brain system. What started as a CLI progress bar fix revealed a broader need for a universal progress routing pattern that works across CLI, Matrix, and future interfaces without requiring complex context threading through service layers.

## Problem Statement

### Current Issue

CLI progress bars stopped working after job progress simplification because:

- CLI progress handler filters events by `interfaceType: "cli"`
- Service plugins create jobs with `interfaceType: "service"`
- Progress events are filtered out and never reach the CLI UI

### Broader Architectural Gap

This symptom reveals a larger design question: How should progress events be routed to the correct interface instances without:

1. Threading interface context through all service plugin layers
2. Creating tight coupling between service plugins and specific interfaces
3. Duplicating routing logic across interface implementations

## Current Architecture Analysis

### Data Flow Trace: CLI Command → Job Progress Event

1. **CLI Input Processing**

   ```typescript
   // CLI sets interfaceType: "cli", channelId: "cli", userId: "cli-user"
   const context: MessageContext = {
     interfaceType: "cli",
     channelId: "cli",
     userId: "cli-user",
     // ...
   };
   ```

2. **Command Execution Chain**

   ```typescript
   // MessageInterfacePlugin passes CommandContext to command handlers
   const commandContext = {
     interfaceType: context.interfaceType, // "cli"
     channelId: context.channelId, // "cli"
     userId: context.userId, // "cli-user"
     // ...
   };
   ```

3. **Service Plugin Job Creation** ⚠️ **BREAK POINT**

   ```typescript
   // ServicePluginContext hardcodes job metadata
   const defaultOptions: JobOptions = {
     metadata: {
       interfaceType: "service", // ← Lost original "cli"
       userId: "system", // ← Lost original "cli-user"
       operationType: "data_processing",
       pluginId,
       // channelId not set
     },
   };
   ```

4. **Progress Event Generation**

   ```typescript
   const event: JobProgressEvent = {
     id: jobId,
     metadata: job.metadata, // Contains interfaceType: "service"
     // ...
   };
   ```

5. **Progress Event Filtering** ⚠️ **FILTER REJECTS**
   ```typescript
   // CLI progress handler rejects the event
   if (context.interfaceType !== "cli") {
     return progressEvents; // Event filtered out
   }
   ```

### Key Components

**MessageInterfacePlugin Base Class**

- Provides `jobMessages` Map: `jobId → messageId`
- Tracks which jobs were initiated by this interface instance
- Handles progress event subscription and routing

**ServicePluginContext**

- Creates jobs with hardcoded metadata defaults
- Currently has no awareness of the originating interface
- Service plugins use this to enqueue jobs

**JobProgressMonitor**

- Emits progress events with job metadata
- Events are broadcast to all interface subscribers
- No built-in routing mechanism

## Proposed Solution: JobMessages-Based Routing with Job Inheritance

### Core Insight

Each MessageInterfacePlugin already maintains a `jobMessages` Map that tracks jobs it initiated. This provides a natural, instance-specific routing mechanism. However, we need to handle job chains and batch operations where child jobs are created by parent jobs.

### Root Job Inheritance Pattern

To handle job chains (Job A creates Job B) and batch operations without complex chain walking:

```typescript
// JobContext metadata includes rootJobId for flattened inheritance
interface JobContext {
  interfaceType: string;
  userId: string;
  pluginId?: string;
  channelId?: string;
  rootJobId?: string; // ← NEW: Points to the top-level job that interface owns
  operationType: OperationType;
  operationTarget?: string;
}

// Job creation logic
function createJob(parentJob?: Job) {
  const jobId = generateId();
  const rootJobId = parentJob?.metadata.rootJobId ?? jobId; // Inherit or self-reference

  return {
    id: jobId,
    metadata: {
      ...defaultMetadata,
      rootJobId, // Flattened inheritance - always points to root
    },
  };
}
```

### Universal Pattern with Inheritance

```typescript
// In any MessageInterfacePlugin.handleProgressEvent()
protected async handleProgressEvent(
  progressEvent: JobProgressEvent,
  context: JobContext,
): Promise<void> {
  // Check direct ownership or inherited ownership via rootJobId
  const isDirectJob = this.jobMessages.has(progressEvent.id);
  const isInheritedJob = context.rootJobId && this.jobMessages.has(context.rootJobId);

  if (!isDirectJob && !isInheritedJob) {
    return; // Not initiated by this interface instance or its job chain
  }

  // Handle progress for this interface
  await this.handleMyJobProgress(progressEvent, context);
}
```

### Architecture Benefits

**1. Instance-Specific Routing**

- Each interface instance only processes jobs it initiated
- Multiple CLI instances can run independently
- No cross-interface event pollution

**2. Interface-Agnostic Services**

- Service plugins don't need interface awareness
- No context threading through service layers
- ServicePluginContext can remain simple

**3. Job Chain and Batch Support**

- Child jobs inherit rootJobId from parents automatically
- Single lookup handles arbitrary depth job chains
- Batch operations work seamlessly with individual job progress

**4. Automatic Future Compatibility**

- New interfaces inherit jobMessages tracking from base class
- Progress routing works automatically
- No per-interface routing implementation needed

**5. Clean Separation of Concerns**

- Job creation: Service plugins handle business logic
- Progress routing: Interface plugins handle UI updates
- No tight coupling between layers

## Implementation Strategy

### Phase 1: Simplify JobContext and Add Inheritance

**Step 1.1**: Simplify JobContextSchema by removing routing fields

```typescript
// In job-queue/src/schema/job-queue.ts
export const JobContextSchema = z.object({
  pluginId: z.string().optional(),
  rootJobId: z.string().optional(), // NEW: For flattened job inheritance
  progressToken: z.union([z.string(), z.number()]).optional(),
  operationType: OperationTypeEnum,
  operationTarget: z.string().optional(),
});
// REMOVED: interfaceType, userId, channelId (routing now via rootJobId)
```

**Step 1.2**: Remove createSystemContext function (now redundant)

```typescript
// REMOVE this function from job-queue.ts:
// export const createSystemContext = (operationType) => ({ ... })

// Replace usages with direct object creation:
// OLD: createSystemContext("data_processing")
// NEW: { operationType: "data_processing" }
```

**Step 1.3**: Update job creation to set rootJobId appropriately

```typescript
// In job creation logic (ServicePluginContext, BatchJobManager, etc.)
const jobMetadata: JobContext = {
  operationType: "data_processing",
  pluginId: "some-plugin",
  rootJobId: parentJob?.metadata.rootJobId ?? jobId, // Inherit or self-reference
  ...options?.metadata, // Allow overrides
};
```

**Step 1.4**: Update CLI progress handler with inheritance logic

```typescript
// In interfaces/cli/src/handlers/progress.ts
const isDirectJob = jobMessages.has(progressEvent.id);
const isInheritedJob = context.rootJobId && jobMessages.has(context.rootJobId);

if (!isDirectJob && !isInheritedJob) {
  return progressEvents; // Not owned by this interface instance
}
```

### Phase 2: Verify Matrix Interface (Validation)

**Matrix interface compatibility**: The Matrix interface inherits from MessageInterfacePlugin and should automatically benefit from the rootJobId-based routing.

**Verification**: Test Matrix progress handling to confirm it works correctly with the new approach.

### Phase 4: Documentation and Templates

**Interface Implementation Template**

```typescript
export class NewInterface extends MessageInterfacePlugin<Config> {
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    // Universal pattern - works for all interfaces
    if (!this.jobMessages.has(progressEvent.id)) {
      return; // Not my job
    }

    // Interface-specific progress handling
    await this.handleInterfaceSpecificProgress(progressEvent, context);
  }
}
```

## Architectural Trade-offs

### JobMessages-Based Routing

**Advantages**:

- ✅ Instance-specific routing
- ✅ No context threading required
- ✅ Interface-agnostic services
- ✅ Automatic inheritance for new interfaces
- ✅ Clean separation of concerns

**Disadvantages**:

- ⚠️ Progress only visible to initiating interface
- ⚠️ Cross-interface job monitoring requires different approach
- ⚠️ Depends on jobMessages Map maintenance

### Metadata-Based Routing (Current Attempt)

**Advantages**:

- ✅ Global job visibility possible
- ✅ Rich metadata available for routing decisions
- ✅ Interface context preserved in job

**Disadvantages**:

- ❌ Requires threading context through all service layers
- ❌ Tight coupling between services and interfaces
- ❌ Complex implementation across multiple abstraction levels
- ❌ Context inheritance chain fragility

## Migration Path

### Current State (Preserve Work)

- ServicePluginContext interfaceType parameter exploration → Commit as investigation
- Abstract handleProgressEvent method → Keep (good improvement)
- CLI progress handler issues → Fix with jobMessages approach

### Implementation Order

1. **Document architecture** (this document) ✅
2. **Commit current exploration** with clear notes ✅
3. **Simplify JobContextSchema**: Remove routing fields (interfaceType, userId, channelId), add rootJobId
4. **Remove createSystemContext function** and update direct usages
5. **Update job creation logic** to set rootJobId (self-reference for root jobs, inherit for children)
6. **Update CLI progress handler** with rootJobId inheritance logic
7. **Test CLI progress bars** with job chains and batch operations
8. **Verify Matrix interface** compatibility
9. **Create interface template** for future use

### Testing Strategy

- **CLI Interface**: Test progress bars with directory sync, content generation
- **Matrix Interface**: Verify existing progress handling still works
- **Cross-Interface**: Ensure interfaces don't see each other's jobs
- **Multiple Instances**: Test multiple CLI instances independently

## Future Considerations

### Cross-Interface Progress Monitoring

If future requirements need cross-interface job visibility:

- Add separate "monitoring" subscription pattern
- Keep jobMessages routing for "ownership"
- Implement admin interface with global job view

### Alternative Progress Contexts

For cases where progress needs different routing:

- System maintenance jobs → Admin interface only
- Batch operations → All interfaces that initiated parts
- Public announcements → All active interfaces

### Performance Implications

- JobMessages Map size scales with active jobs
- Cleanup on job completion prevents memory leaks
- Broadcast events to all interfaces (filtered by jobMessages)

## Conclusion

The jobMessages-based routing approach provides a clean, scalable solution for progress event routing that:

1. Solves the immediate CLI progress bar issue
2. Establishes a universal pattern for all interfaces
3. Maintains clean separation between service and interface layers
4. Automatically works for future interface implementations

This architecture preserves the interface-agnostic nature of service plugins while providing reliable, instance-specific progress routing without complex context threading.
