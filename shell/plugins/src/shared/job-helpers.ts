import type {
  JobOptions,
  IJobQueueService,
  BatchOperation,
  IJobsNamespace,
  JobHandler,
} from "@brains/job-queue";
import { createId } from "@brains/utils";
import type { ToolContext } from "../interfaces";

/**
 * Type for the enqueueJob function created by the helper
 */
export type EnqueueJobFn = (
  type: string,
  data: unknown,
  toolContext: ToolContext | null,
  options?: JobOptions,
) => Promise<string>;

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
  jobQueueService: IJobQueueService,
  pluginId: string,
  scopeJobType: boolean,
): EnqueueJobFn {
  return async (type, data, toolContext, options): Promise<string> => {
    // Destructure to avoid spreading metadata twice
    const { metadata: optionsMetadata, ...restOptions } = options ?? {};

    const jobOptions: JobOptions = {
      source: pluginId,
      // Only set rootJobId if explicitly provided (for batch children)
      // For standalone jobs, let JobQueueService default to the job's own ID
      ...(options?.rootJobId && { rootJobId: options.rootJobId }),
      ...restOptions,
      // Build metadata last to ensure routing context is preserved
      metadata: {
        operationType: "data_processing" as const,
        pluginId,
        // Merge routing context from ToolContext when provided
        ...(toolContext && {
          interfaceType: toolContext.interfaceType,
          channelId: toolContext.channelId,
        }),
        ...optionsMetadata,
      },
    };

    // Add plugin scope unless already scoped (service plugins) or not scoping (interface plugins)
    const finalType =
      scopeJobType && !type.includes(":") ? `${pluginId}:${type}` : type;

    return jobQueueService.enqueue(finalType, data, jobOptions);
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
  shellJobs: IJobsNamespace,
  pluginId: string,
): EnqueueBatchFn {
  return async (operations, options) => {
    const batchId = createId();
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
  jobQueueService: IJobQueueService,
  pluginId: string,
): RegisterHandlerFn {
  return (type, handler) => {
    const scopedType = `${pluginId}:${type}`;
    jobQueueService.registerHandler(scopedType, handler, pluginId);
  };
}
