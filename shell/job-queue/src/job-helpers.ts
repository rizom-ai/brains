import type {
  JobOptions,
  IJobQueueService,
  BatchOperation,
  JobHandler,
  JobInfo,
  ProjectionJobContext,
} from "./types";
import type { Batch, BatchJobStatus } from "./batch-schemas";
import { authenticatedUserId, type JobContract } from "@brains/contracts";
import { createId } from "@brains/utils/id";
import type { z } from "@brains/utils/zod";
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

/** The one lookup the job-availability helper calls. */
export type JobDeclarations = Pick<IJobQueueService, "getValidator">;

/** How a job is routed and queued, apart from its type and payload. */
export interface EnqueueJobRouting {
  /** Tool routing context, or null/omitted for background jobs. */
  toolContext?: ToolContext | null;
  /** Optional queue behavior, routing metadata, and retry settings. */
  options?: JobOptions;
  /** Projection framework identity used for causal lineage propagation. */
  projection?: ProjectionJobContext;
}

/**
 * Type for the enqueueJob function created by the helper
 */
export interface EnqueueJobRequest extends EnqueueJobRouting {
  /** Job type to enqueue. Service plugin jobs are auto-scoped when unscoped. */
  type: string;
  /** Job payload passed to the registered handler. */
  data: unknown;
}

export interface EnqueueJobFn {
  /**
   * Enqueue another package's job through its contract. The data is parsed
   * with the contract's input schema first, and invalid data throws before
   * anything is queued.
   */
  <TInput extends z.ZodType>(
    contract: JobContract<TInput>,
    data: z.input<TInput>,
    routing?: EnqueueJobRouting,
  ): Promise<string>;
  /** Enqueue a job by type, as a plugin does for its own job types. */
  (request: EnqueueJobRequest): Promise<string>;
}

/**
 * Whether a contract's job is declared in this process: its owner is
 * installed. It reads the declarations every process keeps, so a web process,
 * which holds no executable handlers, answers as the worker does.
 */
export type HasJobFn = (contract: JobContract<z.ZodType>) => boolean;

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
  /** Whether a contract's job has a declared handler: its owner is installed */
  has: HasJobFn;
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
  const enqueueRequest = async (
    request: EnqueueJobRequest,
  ): Promise<string> => {
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
        // Routing is useless without the token the caller is waiting on. A
        // context that carries none must not erase an explicitly passed one.
        ...(toolContext.progressToken !== undefined && {
          progressToken: toolContext.progressToken,
        }),
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

  function enqueue<TInput extends z.ZodType>(
    contract: JobContract<TInput>,
    data: z.input<TInput>,
    routing?: EnqueueJobRouting,
  ): Promise<string>;
  function enqueue(request: EnqueueJobRequest): Promise<string>;
  async function enqueue(
    target: JobContract<z.ZodType> | EnqueueJobRequest,
    data?: unknown,
    routing?: EnqueueJobRouting,
  ): Promise<string> {
    if (!("input" in target)) return enqueueRequest(target);
    const parsed = target.input.safeParse(data);
    if (!parsed.success) {
      throw new Error(
        `Invalid job data for ${target.type}: ${parsed.error.message}`,
      );
    }
    return enqueueRequest({ ...routing, type: target.type, data: parsed.data });
  }

  return enqueue;
}

/** Creates the jobs namespace's `has`, reading this process's job declarations. */
export function createHasJobFn(declarations: JobDeclarations): HasJobFn {
  return (contract) => declarations.getValidator(contract.type) !== undefined;
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
    // Otherwise, scope it to the registering plugin.
    const scopedType = type.includes(":") ? type : `${pluginId}:${type}`;
    jobQueueService.registerHandler(scopedType, handler, pluginId);
  };
}
