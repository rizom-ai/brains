# Async Operations & Job Queue Implementation

## Executive Summary

The async operations system has been successfully extracted into a dedicated job queue package with non-blocking batch operations. The core infrastructure is complete and operational. The next priority is implementing plugin-specific job handlers to allow plugins to define their own background operations without violating architectural boundaries.

**Current Status**: Core async infrastructure complete, working on plugin extensibility.

## Implementation Status

### ✅ Completed Phases

1. **Job Queue Package Extraction** - Extracted from entity-service into `@brains/job-queue`
2. **Plugin Context Updates** - Added generic job queue methods to PluginContext
3. **Batch Operations Infrastructure** - Created BatchJobManager with async-only API
4. **API Simplification** - Removed all sync methods, unified async patterns
5. **MCP Compatibility Fixes** - Fixed blocking behaviors, added rollbackAll, implemented status tool

### 🚧 In Progress

**Phase 6: Plugin-Specific Job Handlers** (HIGH PRIORITY)

- Enable plugins to register custom job handlers
- Remove hardcoded job handlers from shell
- Implement proper plugin boundary separation

### 📋 Planned Work

**Phase 7: Interface Updates** (MEDIUM PRIORITY)

- CLI progress bars for batch operations
- Matrix message editing for progress updates
- Operation time estimates

**Phase 8: Documentation & Polish** (LOW PRIORITY)

- User guide for background operations
- Integration tests for async flows
- Tool documentation updates

## Detailed Implementation Guide

### Phase 1: Plugin-Specific Job Handlers (Current Priority)

#### Problem Statement

Currently, all job handlers are registered directly in the shell, which:

- Violates plugin boundaries (shell shouldn't know about plugin-specific jobs)
- Prevents plugins from defining custom background operations
- Limits extensibility of the job queue system

#### Solution: Dynamic Job Handler Registration

##### Step 1: Enable Type Augmentation

Plugins augment job type definitions for type safety:

```typescript
// plugins/site-builder/src/types.ts
declare module "@brains/db" {
  interface PluginJobDefinitions {
    "site-build": {
      input: SiteBuildJobData;
      output: BuildResult;
    };
  }
}

export interface SiteBuildJobData {
  outputDir: string;
  siteConfig?: SiteConfig;
  workingDir?: string;
  clean?: boolean;
}

export interface BuildResult {
  success: boolean;
  routesBuilt: number;
  errors: string[];
  warnings: string[];
  outputDir: string;
}
```

##### Step 2: Implement registerJobHandler in PluginContextFactory

```typescript
export class PluginContextFactory {
  private pluginHandlers = new Map<string, Map<string, JobHandler>>();

  createContext(pluginId: string): PluginContext {
    return {
      // ... existing methods ...

      registerJobHandler: (type: string, handler: JobHandler) => {
        // Automatic namespacing
        const scopedType = `${pluginId}:${type}`;

        // Track for cleanup
        if (!this.pluginHandlers.has(pluginId)) {
          this.pluginHandlers.set(pluginId, new Map());
        }
        this.pluginHandlers.get(pluginId)!.set(scopedType, handler);

        // Register with job queue
        this.jobQueueService.registerHandler(scopedType, handler);

        this.logger.debug(`Registered job handler ${scopedType}`);
      },
    };
  }

  // Clean up on plugin unload
  cleanupPlugin(pluginId: string): void {
    const handlers = this.pluginHandlers.get(pluginId);
    if (handlers) {
      for (const [type, _handler] of handlers) {
        this.jobQueueService.unregisterHandler(type);
      }
      this.pluginHandlers.delete(pluginId);
    }
  }
}
```

##### Step 3: Update JobQueueService

Add dynamic registration support:

```typescript
export class JobQueueService implements IJobQueueService {
  private handlers = new Map<string, JobHandler>();

  public registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  public unregisterHandler(type: string): void {
    this.handlers.delete(type);
    this.logger.debug(`Unregistered handler for job type: ${type}`);
  }

  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
```

#### Trial Implementation: Site Builder Build Job

##### Create Job Handler

```typescript
// plugins/site-builder/src/handlers/siteBuildJobHandler.ts
export class SiteBuildJobHandler
  implements JobHandler<"site-builder:site-build">
{
  constructor(
    private siteBuilder: SiteBuilder,
    private logger: Logger,
  ) {}

  async process(data: SiteBuildJobData, jobId: string): Promise<BuildResult> {
    this.logger.info("Starting site build job", {
      jobId,
      outputDir: data.outputDir,
    });

    try {
      const result = await this.siteBuilder.build(
        {
          outputDir: data.outputDir,
          siteConfig: data.siteConfig,
          workingDir: data.workingDir,
          clean: data.clean ?? true,
        },
        (message, current, total) => {
          this.logger.debug("Build progress", { message, current, total });
        },
      );

      this.logger.info("Site build completed", {
        jobId,
        routesBuilt: result.routesBuilt,
        success: result.errors.length === 0,
      });

      return result;
    } catch (error) {
      this.logger.error("Site build failed", { jobId, error });
      throw error;
    }
  }

  validateAndParse(data: unknown): SiteBuildJobData | null {
    try {
      return siteBuildJobDataSchema.parse(data);
    } catch (error) {
      this.logger.warn("Invalid site build job data", { data, error });
      return null;
    }
  }

  async onError(
    error: Error,
    data: SiteBuildJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Site build job error handler", {
      jobId,
      outputDir: data.outputDir,
      error: error.message,
    });
  }
}
```

##### Register Handler in Plugin

```typescript
export class SiteBuilderPlugin extends BasePlugin {
  async register(context: PluginContext): Promise<PluginCapabilities> {
    // Register job handler
    if (context.registerJobHandler && this.siteBuilder) {
      const buildHandler = new SiteBuildJobHandler(
        this.siteBuilder,
        this.logger,
      );
      context.registerJobHandler("site-build", buildHandler);
    }

    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
    };
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const tools = await super.getTools();

    // Add async build tool
    if (this.siteBuilder) {
      tools.push(
        this.createTool(
          "build-site",
          "Build static site from content",
          {
            outputDir: z.string().describe("Output directory for built site"),
            clean: z
              .boolean()
              .optional()
              .default(true)
              .describe("Clean output directory first"),
          },
          async (input) => {
            const jobId = await this.context.enqueueJob(
              `${this.metadata.id}:site-build`,
              {
                outputDir: input.outputDir,
                siteConfig: this.config.siteConfig,
                clean: input.clean,
              },
            );

            return {
              status: "queued",
              message: "Site build queued",
              jobId,
              tip: "Use the status tool to check build progress",
            };
          },
          "admin",
        ),
      );
    }

    return tools;
  }
}
```

#### Implementation Checklist

- [ ] Update PluginContext interface to make `registerJobHandler` required
- [ ] Implement `registerJobHandler` in PluginContextFactory
- [ ] Add `unregisterHandler` to JobQueueService
- [ ] Create SiteBuildJobHandler in site-builder plugin
- [ ] Add build-site tool to site-builder plugin
- [ ] Update plugin cleanup to unregister handlers
- [ ] Test handler lifecycle (register, process, unregister)
- [ ] Document pattern for other plugins to follow

### Phase 2: Interface Updates

#### CLI Progress Bars

```typescript
// interfaces/cli/src/components/BatchProgress.tsx
export function BatchProgress({ batchId, onComplete }) {
  const [status, setStatus] = useState<BatchStatus>();

  useEffect(() => {
    const unsubscribe = messageBus.subscribe('batch-progress', (msg) => {
      if (msg.batchId === batchId) {
        setStatus(msg);
        if (msg.status === 'completed') {
          onComplete(msg);
        }
      }
    });
    return unsubscribe;
  }, [batchId]);

  if (!status) return <Text>Starting batch operation...</Text>;

  return (
    <Box flexDirection="column">
      <Text>{status.currentOperation || 'Processing...'}</Text>
      <ProgressBar
        percent={status.completedOperations / status.totalOperations * 100}
      />
      <Text dimColor>
        {status.completedOperations} / {status.totalOperations} operations
      </Text>
    </Box>
  );
}
```

#### Matrix Message Editing

```typescript
// interfaces/matrix/src/matrix-interface.ts
private async handleBatchOperation(
  command: string,
  args: string[],
  context: MessageContext
): Promise<void> {
  const progressMessage = await this.client.sendMessage(
    context.channelId,
    "Starting batch operation..."
  );

  const batchId = await this.executeBatchCommand(command, args);

  const unsubscribe = this.messageBus.subscribe('batch-progress', async (msg) => {
    if (msg.batchId === batchId) {
      await this.client.editMessage(
        context.channelId,
        progressMessage.event_id,
        `Progress: ${msg.completedOperations}/${msg.totalOperations}\n` +
        `Current: ${msg.currentOperation}`
      );

      if (msg.status === 'completed') {
        unsubscribe();
        await this.client.editMessage(
          context.channelId,
          progressMessage.event_id,
          `✅ Batch operation completed: ${msg.completedOperations} operations`
        );
      }
    }
  });
}
```

#### Operation Time Estimates

```typescript
interface BatchJobStatus {
  // ... existing fields ...
  estimatedTimeRemaining?: number; // milliseconds
  averageOperationTime?: number; // milliseconds
}

function estimateCompletion(batch: BatchJobStatus): string {
  if (!batch.averageOperationTime || batch.completedOperations === 0) {
    return "Calculating...";
  }

  const remainingOps = batch.totalOperations - batch.completedOperations;
  const estimatedMs = remainingOps * batch.averageOperationTime;

  return formatDuration(estimatedMs);
}
```

### Phase 3: Future Enhancements

1. **Job cancellation support** - Allow users to cancel running jobs
2. **Job priority levels** - High/medium/low priority processing
3. **Resource throttling** - Limit concurrent operations
4. **Persistent job history** - Track completed jobs for auditing
5. **Web UI for monitoring** - Visual job queue dashboard
6. **Distributed processing** - Scale across multiple workers
7. **WebSocket updates** - Real-time progress without polling
8. **Batch templates** - Reusable operation patterns
9. **Scheduled operations** - Cron-like job scheduling
10. **Plugin job isolation** - Separate queues per plugin

## Architecture & Design Principles

### Core Principles

1. **Plugin Context Boundary** - Plugins never import from core services directly
2. **Generic Infrastructure** - Plugin context provides only generic methods
3. **Job Handler Registration** - Plugins register handlers during initialization
4. **Dependency Flow**:
   - Core services (shell/\*) can import from each other
   - Plugins can only import from shared/\* packages
   - Plugins access shell services through context
5. **Infrastructure vs Domain**:
   - Infrastructure: Job queue, batch tracking, status reporting
   - Domain: Business logic, formatting, entity operations

### Benefits

- **Clean Architecture** - Proper separation of concerns
- **Non-blocking Operations** - Better UX, no frozen interfaces
- **Progress Visibility** - Real-time operation tracking
- **Scalability** - Easy to add new job types
- **Plugin Isolation** - Plugins remain decoupled
- **Consistent API** - Single async pattern everywhere

## Example Usage Flows

### Plugin Job Handler Flow

```
// Plugin registers handler
Plugin: site-builder registers "site-build" handler

// User triggers job
User: build-site --output-dir ./dist
System: {
  "status": "queued",
  "jobId": "job-xyz",
  "message": "Site build queued",
  "tip": "Use the status tool to check build progress"
}

// Check status
User: shell:status
System: {
  "operations": [{
    "jobId": "job-xyz",
    "type": "site-builder:site-build",
    "status": "processing",
    "plugin": "site-builder",
    "progress": "Building route: /about"
  }]
}
```

### Batch Operations Flow

```
// Start batch operation
User: generate --page landing
System: {
  "status": "queued",
  "batchId": "batch-123",
  "message": "Generating 3 sections",
  "tip": "Use the status tool to check progress"
}

// Check all operations
User: shell:status
System: {
  "message": "1 background operation in progress",
  "operations": [{
    "batchId": "batch-123",
    "plugin": "site-builder",
    "type": "content-generation",
    "progress": "2/3 sections (67%)",
    "status": "processing",
    "currentTask": "Generating landing:features"
  }]
}
```

## Appendix: Completed Work Reference

### Phase 1: Job Queue Package Extraction

Successfully extracted job queue components from entity-service into a dedicated `@brains/job-queue` package:

- Created proper package structure with clear boundaries
- Moved core components while keeping handlers in their domains
- Updated dependencies to prevent circular imports
- Ensured plugins access queue only through context

### Phase 2: Plugin Context Updates

Implemented generic job queue interface in PluginContext:

- Added `enqueueJob`, `getJobStatus`, `waitForJob` methods
- Added batch operations support
- Removed domain-specific methods for cleaner API
- All job types now use generic interface

### Phase 3: Batch Operations Infrastructure

Created BatchJobManager for coordinating multi-operation jobs:

- Tracks progress across multiple operations
- Emits progress events via MessageBus
- Provides status aggregation
- Handles operation failures gracefully

### Phase 4: API Simplification

Converted ContentManager to async-only API:

- Removed all synchronous methods
- Unified return pattern (always returns job/batch ID)
- Consistent user experience across all tools
- Better performance and scalability

### Phase 5: MCP Compatibility Fixes

Resolved critical issues discovered during MCP testing:

- Fixed generate tool blocking behavior
- Added missing rollbackAll feature
- Implemented shell-level status tool
- Ensured consistent async behavior everywhere
