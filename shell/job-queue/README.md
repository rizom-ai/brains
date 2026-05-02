# @brains/job-queue

Background job processing system with progress tracking for Brain applications.

## Overview

This package provides persistent background job queueing, handler registration,
worker execution, retries, progress events, and in-process batch tracking.

## Features

- Background job processing
- Handler-based job validation and execution
- Progress reporting through `JobProgressMonitor`
- Batch job management
- Job priorities, delays, retries, and deduplication
- SQLite/libSQL persistence
- Worker concurrency controls

## Usage

```typescript
import { JobQueueService, JobQueueWorker } from "@brains/job-queue";
import { Logger, z } from "@brains/utils";

const embedJobSchema = z.object({ entityId: z.string() });

const logger = Logger.getInstance();
const jobQueue = JobQueueService.getInstance(
  { url: "file:job-queue.db" },
  logger,
);

jobQueue.registerHandler("entity:embed", {
  validateAndParse(data) {
    const result = embedJobSchema.safeParse(data);
    return result.success ? result.data : null;
  },

  async process(data, jobId, progress) {
    await progress.report({ progress: 50, total: 100, message: "Embedding" });
    return { success: true, jobId, entityId: data.entityId };
  },
});

const jobId = await jobQueue.enqueue(
  "entity:embed",
  { entityId: "123" },
  {
    source: "example",
    priority: 1,
    metadata: { operationType: "data_processing" },
  },
);
```

## Workers

Workers poll for queued jobs and dispatch them to registered handlers.

```typescript
const worker = JobQueueWorker.createFresh(jobQueue, progressMonitor, logger, {
  concurrency: 2,
  pollInterval: 100,
  autoStart: false,
});

await worker.start();
```

## Batch Operations

`BatchJobManager` tracks a logical batch as multiple child jobs. Batch metadata is
currently in-memory; child jobs themselves remain persisted in the job queue.

```typescript
const batchId = await batchJobManager.enqueueBatch(
  [
    { type: "entity:embed", data: { entityId: "1" } },
    { type: "entity:embed", data: { entityId: "2" } },
  ],
  {
    source: "example",
    metadata: { operationType: "batch_processing" },
  },
  "batch-123",
);

const status = await batchJobManager.getBatchStatus(batchId);
```

## License

Apache-2.0
