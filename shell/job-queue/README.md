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
- Fenced processing attempts with renewable leases
- Persisted worker-session liveness and startup recovery
- Per-handler execution deadlines and cancellation signals
- SQLite/libSQL persistence
- Worker concurrency controls

## Usage

```typescript
import { JobQueueService, JobQueueWorker } from "@brains/job-queue";
import { Logger, z } from "@brains/utils";

const embedJobSchema = z.object({ entityId: z.string() });

const logger = Logger.getInstance();
const jobQueue = JobQueueService.createFresh(
  { url: "file:job-queue.db" },
  logger,
);

jobQueue.registerHandler("entity:embed", {
  validateAndParse(data) {
    const result = embedJobSchema.safeParse(data);
    return result.success ? result.data : null;
  },

  executionTimeoutMs: 60_000,

  async process(data, jobId, progress, signal) {
    signal.throwIfAborted();
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

Every processing attempt receives a unique fencing token, worker-session owner,
and renewable lease. Completion, failure, progress, and heartbeat writes only
apply while that token still owns the job.

Workers use a stable slot ID and a fresh session ID on every start. Starting a
new session for the same slot immediately supersedes the previous session and
makes its attempts reclaimable. Attempts from another slot are reclaimed only
after both the attempt lease and owner-session heartbeat expire. Reclaims count
against the job's retry budget.

`JobQueueWorkerConfig` controls the lifecycle:

- `workerSlotId` (or `BRAIN_JOB_WORKER_SLOT_ID`) identifies the stable worker;
- `leaseDurationMs` and `attemptHeartbeatIntervalMs` control attempt leases;
- `workerHeartbeatIntervalMs` and `workerSessionTimeoutMs` control persisted
  session liveness;
- `defaultExecutionTimeoutMs` is the fallback job deadline;
- `cancellationGraceMs` bounds cooperative cancellation;
- `errorCallbackTimeoutMs` bounds an optional handler `onError` callback;
- `onUnhealthy` notifies the owning runtime when safe execution is no longer
  possible.

A handler can override the default deadline with `executionTimeoutMs`. Every
handler receives an `AbortSignal`. If a timed-out handler does not settle during
the cancellation grace period, the worker becomes unhealthy and stops claiming
jobs without releasing that attempt for an in-process retry. External process
supervision must replace such a worker. The shell runtime treats this state as
fatal: it records the reason and exits so the container restart policy can
replace the process. A bounded host watchdog separately handles event-loop
liveness failures that prevent the process from exiting itself.

## Deduplication

Deduplicating enqueue decisions are serialized in a database write transaction,
so separate web and worker processes sharing one queue database observe the same
result. Validation runs before the transaction; invalid input is rejected even
when an active job already matches.

| Strategy   | Pending match                                   | Processing-only match                 | No match |
| ---------- | ----------------------------------------------- | ------------------------------------- | -------- |
| `none`     | insert                                          | insert                                | insert   |
| `skip`     | return the pending ID                           | insert one pending successor          | insert   |
| `replace`  | fail the pending row and insert its replacement | insert one pending successor          | insert   |
| `coalesce` | advance and return the pending row              | advance and return the processing row | insert   |

A non-empty `deduplicationKey` limits matching to jobs with the same metadata
key. An absent or empty key matches every active job of the same type. Candidate
selection is deterministic: the newest pending row by `(createdAt, id)` wins;
`coalesce` considers processing rows only when no pending row matches.
Pre-existing duplicate pending rows are not repaired implicitly.

Skipped and coalesced requests do not reserve projection job budget. Processing
attempt status, payload, ownership, and fencing fields are left unchanged.

The optional remote contract test uses `JOB_QUEUE_REMOTE_TEST_URL` and, when
required, `JOB_QUEUE_REMOTE_TEST_AUTH_TOKEN`:

```bash
bun test test/job-queue-remote-contract.test.ts
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

AGPL-3.0-only
