import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";
import type { Logger } from "@brains/utils/logger";
import { jobProgressChannel } from "@brains/plugins";

/**
 * Set up listener for job progress events
 * This is primarily for debugging and logging purposes
 */
export function setupJobProgressListener(
  runtime: Pick<InterfaceRuntime, "listen">,
  logger: Logger,
): void {
  // Subscribe to job-progress events for debugging; the channel refuses and
  // logs a malformed one.
  runtime.listen(jobProgressChannel, ({ payload: event }) => {
    // Log different types of progress events
    const eventType = event.type; // "job" or "batch"
    const status = event.status;
    const eventId = event.id; // This is batchId for batch events, jobId for job events

    logger.debug(`${eventType} ${eventId} - ${status}:`, {
      id: event.id,
      message: event.message,
      progress: event.progress,
      metadata: event.metadata,
    });

    // Log batch-specific details if available
    if (event.batchDetails) {
      logger.debug(`Batch details for ${eventId}:`, {
        totalOperations: event.batchDetails.totalOperations,
        completedOperations: event.batchDetails.completedOperations,
        failedOperations: event.batchDetails.failedOperations,
        currentOperation: event.batchDetails.currentOperation,
        errors: event.batchDetails.errors,
      });
    }

    // Log job-specific details if available
    if (event.jobDetails) {
      logger.debug(`Job details for ${eventId}:`, {
        jobType: event.jobDetails.jobType,
        priority: event.jobDetails.priority,
        retryCount: event.jobDetails.retryCount,
      });
    }
  });

  logger.debug("Subscribed to job progress events");
}
