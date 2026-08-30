import type {
  JobOptions,
  IJobQueueService,
  BatchOperation,
  JobHandler,
  JobInfo,
  ProjectionJobContext,
} from "./types";
import type { Batch, BatchJobStatus } from "./batch-schemas";
import { authenticatedUserId } from "@brains/contracts";
import { createId } from "@brains/utils/id";
import type { ToolContext } from "@brains/mcp-service";

/**
 * The one job-queue method these helpers call.
 *
 * IJobQueueService is a large surface; asking for all of it meant a test could
 * not supply an enqueue without asserting it was the whole service.
 */
export type JobEnqueuer = Pick<IJobQueueService, "enqueue">;

/** The one method the handler-registration helper calls. */
export type JobHandlerRegistrar = Pick<IJobQueueService, "registerHandler">;

/**
 * Type for the enqueueJob function created by the helper
 */
export interface EnqueueJobRequest {
  /** Job type to enqueue. Service plugin jobs are auto-scoped when unscoped. */
  type: string;
  /** Job payload passed to the registered handler. */
  data: unknown;
  /** Tool routing context, or null/omitted for background jobs. */
  toolContext?: ToolContext | null;
  /** Optional queue behavior, routing metadata, and retry settings. */
  options?: JobOptions;
  /** Projection framework identity used for causal lineage propagation. */
  projection?: ProjectionJobContext;
}

export type EnqueueJobFn = (request: EnqueueJobRequest) => Promise<string>;

/**
 * Unified jobs namespace with monitoring and write operations.
 * Used by all plugin contexts and system tools.
 * Scoping (auto-prefix plugin ID) is handled by factory functions, not the type.
 */
export interface JobsNamespace {
  // === Monitoring ===
  /** Get active jobs, optionally filtered by type */
  getActiveJobs(types?: string[]): Promise<JobInfo[]>;
  /** Get recent jobs of any status, newest first, optionally filtered by type */
  getRecentJobs(types?: string[], limit?: number): Promise<JobInfo[]>;
  /** Get status of a specific job */
  getStatus(jobId: string): Promise<JobInfo | null>;
  /** Get all active batches */
  getActiveBatches(): Promise<Batch[]>;
  /** Get status of a specific batch */
  getBatchStatus(batchId: string): Promise<BatchJobStatus | null>;

  // === Write ===
  /** Enqueue a job for background processing */
  enqueue: EnqueueJobFn;
  /** Enqueue multiple operations as a batch (batchId generated internally) */
  enqueueBatch: (
    operations: BatchOperation[],
    options?: JobOptions,
  ) => Promise<string>;
  /** Register a handler for a job type */
  registerHandler: <T = unknown, R = unknown>(
    type: string,
    handler: JobHandler<string, T, R>,
  ) => void;
}

/**
 * Creates an enqueueJob function for plugin contexts
 *
 * This shared helper ensures consistent job enqueueing behavior across
 * ServicePluginContext and InterfacePluginContext, including:
 * - Automatic routing context from ToolContext
 * - Plugin ID tracking
 * - Default metadata
 *
 * @param jobQueueService - The job queue service to use
 * @param pluginId - The plugin ID for scoping
 * @param scopeJobType - Whether to auto-scope job types with pluginId (true for service plugins)
 */
export function createEnqueueJobFn(
  jobQueueService: JobEnqueuer,
  pluginId: string,
  scopeJobType: boolean,
): EnqueueJobFn {
  return async (request): Promise<string> => {
    const { type, data, toolContext = null, options, projection } = request;
    const requestedByUserId = toolContext
      ? authenticatedUserId(toolContext)
      : undefined;
    // Destructure to avoid spreading metadata twice
    const { metadata: optionsMetadata, ...restOptions } = options ?? {};
    const metadata: JobOptions["metadata"] = {
      operationType: "data_processing",
      pluginId,
      ...optionsMetadata,
      // Verified tool routing and attribution override caller-supplied options.
      ...(toolContext && {
        interfaceType: toolContext.interfaceType,
        conversationId: toolContext.conversationId,
        channelId: toolContext.channelId,
        requestedByActor: toolContext.actor,
        ...(requestedByUserId ? { requestedByUserId } : {}),
        requestedByInterface: toolContext.interfaceType,
      }),
    };
    if (toolContext && !requestedByUserId) {
      delete metadata.requestedByUserId;
    }

    const jobOptions: JobOptions = {
      ...restOptions,
      source: pluginId,
      // Only set rootJobId if explicitly provided (for batch children)
      // For standalone jobs, let JobQueueService default to the job's own ID
      ...(options?.rootJobId && { rootJobId: options.rootJobId }),
      ...(projection && { projection }),
      metadata,
    };

    // Add plugin scope unless already scoped (service plugins) or not scoping (interface plugins)
    const finalType =
      scopeJobType && !type.includes(":") ? `${pluginId}:${type}` : type;

    return jobQueueService.enqueue({
      type: finalType,
      data,
      options: jobOptions,
    });
  };
}

export type EnqueueBatchFn = (
  operations: BatchOperation[],
  options?: JobOptions,
) => Promise<string>;

/**
 * Creates an enqueueBatch function for plugin contexts.
 *
 * Shared between ServicePluginContext and InterfacePluginContext.
 * Handles operation type scoping, batchId generation, and metadata.
 */
export function createEnqueueBatchFn(
  shellJobs: {
    enqueueBatch(
      operations: BatchOperation[],
      options: JobOptions,
      batchId: string,
      pluginId: string,
    ): Promise<string>;
  },
  pluginId: string,
): EnqueueBatchFn {
  return async (operations, options) => {
    const batchId = options?.rootJobId ?? createId();
    const scopedOperations = operations.map((op) => ({
      ...op,
      type: op.type.includes(":") ? op.type : `${pluginId}:${op.type}`,
    }));
    const jobOptions: JobOptions = {
      ...options,
      source: pluginId,
      rootJobId: batchId,
      metadata: {
        ...options?.metadata,
        operationType: "batch_processing" as const,
        pluginId,
      },
    };
    await shellJobs.enqueueBatch(
      scopedOperations,
      jobOptions,
      batchId,
      pluginId,
    );
    return batchId;
  };
}

export type RegisterHandlerFn = <T = unknown, R = unknown>(
  type: string,
  handler: JobHandler<string, T, R>,
) => void;

/**
 * Creates a registerHandler function for plugin contexts.
 *
 * Shared between ServicePluginContext and InterfacePluginContext.
 * Handles automatic type scoping with pluginId.
 */
export function createRegisterHandlerFn(
  jobQueueService: JobHandlerRegistrar,
  pluginId: string,
): RegisterHandlerFn {
  return (type, handler) => {
    // If type already contains ":", treat it as fully qualified (entity-type scoped).
    // Otherwise, auto-scope with pluginId for backward compatibility.
    const scopedType = type.includes(":") ? type : `${pluginId}:${type}`;
    jobQueueService.registerHandler(scopedType, handler, pluginId);
  };
}
