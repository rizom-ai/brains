import { toSdkError } from "@brains/contracts";
import type {
  IJobQueueService,
  IJobsNamespace,
  JobHandler,
  JobInfo,
  JobQueueEnqueueRequest,
} from "@brains/job-queue";

export interface MockJobQueue {
  readonly jobs: IJobsNamespace;
  readonly jobQueueService: IJobQueueService;
}

/** Both views share enqueued jobs, caller metadata and registered handlers. */
export function createMockJobQueue(): MockJobQueue {
  // --- In-memory job queue state ---
  // Enqueued jobs are remembered so status reads see what writes created; a
  // fake queue that forgets its own enqueues makes reconciliation code treat
  // every fresh job as pruned.
  const enqueuedJobs = new Map<string, JobInfo>();
  let enqueuedJobCount = 0;

  function recordEnqueuedJob(request: JobQueueEnqueueRequest): string {
    // The real queue skips an enqueue whose key already has a job waiting, and
    // hands back the waiting job's id. A fake that queued both would let a
    // declaration pass here and stack duplicate work against a real brain.
    const dedupeKey = request.options?.deduplicationKey;
    if (request.options?.deduplication === "skip" && dedupeKey !== undefined) {
      const waiting = [...enqueuedJobs.values()].find(
        (job) =>
          job.status === "pending" &&
          job.type === request.type &&
          job.metadata["deduplicationKey"] === dedupeKey,
      );
      if (waiting) return waiting.id;
    }
    const data = JSON.stringify(request.data);
    if (!data)
      throw new Error(
        `Job data must be JSON-serializable for type: ${request.type}`,
      );
    const id = `job-${++enqueuedJobCount}`;
    const now = Date.now();
    enqueuedJobs.set(id, {
      id,
      type: request.type,
      data,
      status: "pending",
      source: request.options?.source ?? null,
      priority: 0,
      retryCount: 0,
      maxRetries: request.options?.maxRetries ?? 3,
      lastError: null,
      createdAt: now,
      scheduledFor: now,
      startedAt: null,
      completedAt: null,
      attemptId: null,
      workerSlotId: null,
      workerSessionId: null,
      leaseExpiresAt: null,
      attemptHeartbeatAt: null,
      runtimeUpdatedAt: now,
      metadata: {
        operationType: "data_processing",
        ...(dedupeKey !== undefined ? { deduplicationKey: dedupeKey } : {}),
        // The real queue keeps the metadata the enqueue arrived with — which
        // by this point carries the enqueuing tool's caller, so a job can say
        // who it works for. A fake that dropped it would let a handler pass
        // here and refuse against a real brain.
        ...(request.options?.metadata ?? {}),
        rootJobId: request.options?.rootJobId ?? id,
      },
      progress: null,
      result: null,
    });
    return id;
  }

  function listQueuedJobs(types?: string[]): JobInfo[] {
    return [...enqueuedJobs.values()].filter(
      (job) => !types || types.length === 0 || types.includes(job.type),
    );
  }

  // --- Jobs namespace ---
  const jobs: IJobsNamespace = {
    // A batch is its operations filed under one root, as the real queue files them.
    enqueueBatch: async (operations, options, batchId) => {
      for (const operation of operations) {
        recordEnqueuedJob({
          type: operation.type,
          data: operation.data,
          options: {
            ...options,
            rootJobId: batchId,
            ...(operation.maxRetries !== undefined
              ? { maxRetries: operation.maxRetries }
              : {}),
          },
        });
      }
      return batchId;
    },
    getActiveBatches: async () => [],
    getBatchStatus: async (batchId: string) => {
      const children = [...enqueuedJobs.values()].filter(
        (job) => job.metadata["rootJobId"] === batchId,
      );
      const completed = children.filter(
        (job) => job.status === "completed",
      ).length;
      const failed = children.filter((job) => job.status === "failed").length;
      const settled = completed + failed === children.length;
      return {
        batchId,
        totalOperations: children.length,
        completedOperations: completed,
        failedOperations: failed,
        errors: children.flatMap((job) =>
          job.status === "failed"
            ? [toSdkError({ code: job.lastErrorCode }).toJSON()]
            : [],
        ),
        status: settled
          ? failed > 0
            ? ("failed" as const)
            : ("completed" as const)
          : children.some((job) => job.status === "processing")
            ? ("processing" as const)
            : ("pending" as const),
      };
    },
    getActiveJobs: async (types) =>
      listQueuedJobs(types).filter(
        (job) => job.status === "pending" || job.status === "processing",
      ),
    getRecentJobs: async (types, limit = 20) =>
      listQueuedJobs(types)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit),
    getStatus: async (jobId) => enqueuedJobs.get(jobId) ?? null,
  };

  const jobHandlers = new Map<
    string,
    { handler: JobHandler; pluginId: string | undefined }
  >();
  const jobQueueService: IJobQueueService = {
    enqueue: async (request) => recordEnqueuedJob(request),
    // The real service reports whether the job was still claimable; the fake
    // has no attempt bookkeeping, so it reports success.
    complete: async () => true,
    fail: async () => true,
    update: async () => true,
    getStatus: async (jobId) => enqueuedJobs.get(jobId) ?? null,
    getJobsByRootJobId: async (rootJobId) =>
      listQueuedJobs().filter((job) => job.metadata.rootJobId === rootJobId),
    getStats: async () => ({
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
      total: 0,
    }),
    cleanup: async () => 0,
    getRuntimeUpdates: async () => [],
    registerHandler: (type, handler, pluginId) => {
      jobHandlers.set(type, { handler, pluginId });
    },
    unregisterHandler: (type) => {
      jobHandlers.delete(type);
    },
    unregisterPluginHandlers: (pluginId) => {
      for (const [type, registration] of jobHandlers) {
        if (registration.pluginId === pluginId) jobHandlers.delete(type);
      }
    },
    getRegisteredTypes: () => [...jobHandlers.keys()],
    getHandler: (type) => jobHandlers.get(type)?.handler,
    getValidator: (type) => jobHandlers.get(type)?.handler,
    finalizeHandlerRegistrations: () =>
      [...jobHandlers].map(([type, { pluginId }]) => ({ type, pluginId })),
    getExecutionRegistrations: () =>
      [...jobHandlers].map(([type, { pluginId }]) => ({ type, pluginId })),
    getActiveJobs: async (types) =>
      listQueuedJobs(types).filter(
        (job) => job.status === "pending" || job.status === "processing",
      ),
    getRecentJobs: async (types, limit = 20) =>
      listQueuedJobs(types)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit),
    getFailedJobs: async () => [],
    getStatusByEntityId: async () => null,
    getDiagnostics: async () => ({
      totals: { pending: 0, processing: 0, failed: 0, completed: 0 },
      byType: [],
      oldestPendingAgeMs: null,
      duePending: 0,
      oldestDuePendingAgeMs: null,
      latestClaimAgeMs: null,
      oldestProcessingAgeMs: null,
      staleLeaseCount: 0,
      workerSessions: {
        total: 0,
        active: 0,
        stale: 0,
        latestHeartbeatAgeMs: null,
      },
    }),
    // No worker loop is modelled: nothing is ever dequeued, so lease and
    // session calls are inert rather than pretending to hold a claim.
    dequeue: async () => null,
    startWorkerSession: async () => {},
    heartbeatWorkerSession: async () => true,
    endWorkerSession: async () => true,
    renewAttemptLease: async () => true,
    recordAttemptProgress: async () => true,
    // Idle by construction, for the same reason: nothing is ever dequeued.
    waitForIdle: async () => {},
    close: () => {},
  };

  return { jobs, jobQueueService };
}
