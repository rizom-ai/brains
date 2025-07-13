import type { PluginContext } from "@brains/plugin-utils";
import {
  JobProgressEventSchema,
  type JobProgressEvent,
} from "@brains/job-queue";
import { JobContextSchema, type JobContext } from "@brains/db";

/**
 * Handlers for progress event processing
 */
export interface ProgressHandlers {
  onProgress: (event: JobProgressEvent, context: JobContext) => Promise<void>;
  onError: (error: unknown) => void;
  onInvalidSchema: () => void;
}

/**
 * Extract progress event context from event metadata
 */
export function extractJobContext(
  metadata?: JobProgressEvent["metadata"],
): JobContext {
  return JobContextSchema.parse(metadata);
}

/**
 * Setup progress event handler with callbacks
 */
export function setupProgressHandler(
  context: PluginContext,
  handlers: ProgressHandlers,
): void {
  context.subscribe("job-progress", async (message) => {
    try {
      const validationResult = JobProgressEventSchema.safeParse(
        message.payload,
      );
      if (!validationResult.success) {
        handlers.onInvalidSchema();
        return { noop: true };
      }

      const progressEvent = validationResult.data;
      const eventContext = extractJobContext(progressEvent.metadata);

      await handlers.onProgress(progressEvent, eventContext);

      return { noop: true };
    } catch (error) {
      handlers.onError(error);
      return { noop: true };
    }
  });
}
