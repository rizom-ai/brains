import type { JobOptions, IJobQueueService } from "@brains/job-queue";
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
