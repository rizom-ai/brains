# @brains/job-queue

Background job processing system with progress tracking for Personal Brain applications.

## Overview

This service provides asynchronous job processing with real-time progress tracking, batch operations support, and automatic retries.

## Features

- Background job processing
- Real-time progress tracking
- Batch job management
- Job priorities and retries
- Progress event streaming
- SQLite-based persistence
- Worker pool management

## Usage

```typescript
import { JobQueueService } from "@brains/job-queue";

const jobQueue = JobQueueService.getInstance({
  database: db,
  messageBus: bus,
});

// Queue a job
const jobId = await jobQueue.queueJob({
  type: "entity:embed",
  payload: { entityId: "123" },
  priority: 1,
});

// Queue batch job
const batchId = await jobQueue.queueBatchJob({
  type: "import:directory",
  operations: files.map(f => ({
    name: `Import ${f}`,
    payload: { file: f },
  })),
});

// Monitor progress
messageBus.on("job:progress", (event) => {
  console.log(`Job ${event.jobId}: ${event.progress}%`);
});
```

## Job Handlers

Register handlers for job types:

```typescript
jobQueue.registerHandler("entity:embed", async (job) => {
  const { entityId } = job.payload;
  
  // Report progress
  await job.updateProgress(50, "Generating embedding");
  
  // Do work
  const result = await generateEmbedding(entityId);
  
  // Complete
  await job.updateProgress(100, "Complete");
  return result;
});
```

## Progress Monitoring

Real-time progress updates via events:

```typescript
// Subscribe to progress events
messageBus.on("job:progress", (event) => {
  const { jobId, progress, message, details } = event;
  // Update UI
});

// Batch progress
messageBus.on("batch:progress", (event) => {
  const { batchId, completed, total, operations } = event;
  // Show batch progress
});
```

## License

MIT