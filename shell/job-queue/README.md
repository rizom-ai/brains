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
- Claim timeout recovery for crashed workers
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

const jobId = await jobQueue.enqueue({
  type: "entity:embed",
  data: { entityId: "123" },
  options: {
    source: "example",
    priority: 1,
    metadata: { operationType: "data_processing" },
  },
});
```

## Configuration

`JobQueueService` accepts a `claimTimeoutMs` option. A `processing` job whose
`startedAt` timestamp is older than this timeout is eligible to be reclaimed by
another worker. The default is `300_000` ms.

If a worker crashes after claiming a job, the next worker can reclaim it after
the timeout. Reclaims increment `retryCount` and set `lastError` to
`"Claim expired"`; if the reclaim would exceed `maxRetries`, the job is marked
`failed` instead of being returned for processing.

Handlers that legitimately run longer than `claimTimeoutMs` can be processed
again before they finish because heartbeat/claim-extension support is not yet
implemented. Increase `claimTimeoutMs` for long-running workloads.

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
