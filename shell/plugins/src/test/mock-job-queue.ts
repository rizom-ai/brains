import { toSdkError } from "@brains/contracts";
import type {
  IJobQueueService,
  IJobsNamespace,
  JobHandler,
  JobInfo,
  JobQueueEnqueueRequest,
} from "@brains/job-queue";

/**
 * The two views of one in-memory queue.
 *
 * IJobsNamespace is what a plugin sees and IJobQueueService is what the shell
 * sees, and they are the same jobs. Building them together is what keeps that
 * true: separate state would let a test enqueue through one and read nothing
 * from the other.
 */
export interface MockJobQueue {
  readonly jobs: IJobsNamespace;
  readonly jobQueueService: IJobQueueService;
}

export function createMockJobQueue(): MockJobQueue {
  // Enqueued jobs are remembered so status reads see what writes created; a
  // fake queue that forgets its own enqueues makes reconciliation code treat
  // every fresh job as pruned.
  const enqueuedJobs = new Map<string, JobInfo>();
  let enqueuedJobCount = 0;
  // Registrations are remembered so a job contract finds its owner; a queue
  // that forgot them would report every owner as missing.
  const handlers = new Map<
    string,
    { handler: JobHandler; pluginId: string | undefined }
  >();

  function recordEnqueuedJob(request: JobQueueEnqueueRequest): string {
    const id = `job-${++enqueuedJobCount}`;
    const now = Date.now();
    enqueuedJobs.set(id, {
      id,
      type: request.type,
      data:
        typeof request.data === "string"
          ? request.data
          : JSON.stringify(request.data ?? {}),
      status: "pending",
      source: request.options?.source ?? null,
      priority: 0,
      retryCount: 0,
      maxRetries: request.options?.maxRetries ?? 3,
      lastError: null,
      lastErrorPublic: null,
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
        ...request.options?.metadata,
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
    enqueueBatch: async (operations, options, batchId) => {
      for (const operation of operations) {
        recordEnqueuedJob({
          type: operation.type,
          data: operation.data,
          options: { ...options, rootJobId: batchId },
        });
      }
      return batchId;
    },
    getActiveBatches: async () => [],
    getBatchStatus: async (batchId: string) => ({
      batchId,
      totalOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      errors: [],
      status: "completed" as const,
    }),
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

  const jobQueueService: IJobQueueService = {
    enqueue: async (request) => recordEnqueuedJob(request),
    // The real service reports whether the job was still claimable; the fake
    // has no attempt bookkeeping, so it reports success. A settled job is
    // recorded as the real queue records it: the diagnostic beside the
    // failure's public form, both cleared on completion.
    complete: async (jobId, result) => {
      const job = enqueuedJobs.get(jobId);
      if (job) {
        enqueuedJobs.set(jobId, {
          ...job,
          status: "completed",
          result,
          lastError: null,
          lastErrorPublic: null,
          completedAt: Date.now(),
        });
      }
      return true;
    },
    fail: async (jobId, error) => {
      const job = enqueuedJobs.get(jobId);
      if (job) {
        enqueuedJobs.set(jobId, {
          ...job,
          status: "failed",
          lastError: error.message,
          lastErrorPublic: toSdkError(error).toJSON(),
          completedAt: Date.now(),
        });
      }
      return true;
    },
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
      handlers.set(type, { handler, pluginId });
    },
    unregisterHandler: (type) => {
      handlers.delete(type);
    },
    unregisterPluginHandlers: (pluginId) => {
      [...handlers]
        .filter(([, registration]) => registration.pluginId === pluginId)
        .forEach(([type]) => handlers.delete(type));
    },
    getRegisteredTypes: () => [...handlers.keys()],
    getHandler: (type) => handlers.get(type)?.handler,
    getValidator: (type) => handlers.get(type)?.handler,
    finalizeHandlerRegistrations: () => [],
    getExecutionRegistrations: () => [],
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
