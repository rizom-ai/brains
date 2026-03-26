import type { IJobQueueService } from "./types";
import type { JobOptions } from "./schema/types";

export interface ScopedJobQueue {
  enqueue: (
    type: string,
    data: unknown,
    options?: Partial<JobOptions>,
  ) => Promise<string>;
}

/**
 * Create a scoped job queue that auto-sets source on enqueue.
 * Used by system tools and can replace plugin job helpers.
 */
export function createScopedJobQueue(
  service: IJobQueueService,
  source: string,
): ScopedJobQueue {
  return {
    enqueue: (type, data, options) => {
      const jobOptions: JobOptions = {
        source,
        metadata: {
          operationType: "content_operations",
          pluginId: source,
        },
        ...options,
      };
      return service.enqueue(type, data, jobOptions);
    },
  };
}
