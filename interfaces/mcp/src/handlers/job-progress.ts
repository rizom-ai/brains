import type {
  InterfacePluginContext,
  JobProgressEvent,
  Logger,
} from "@brains/plugins";

/**
 * Set up listener for job progress events
 * This is primarily for debugging and logging purposes
 */
export function setupJobProgressListener(
  context: InterfacePluginContext,
  logger: Logger,
): void {
  // Subscribe to job-progress events for debugging
  context.subscribe("job-progress", async (message) => {
    const { batchId, event } = message.payload as {
      batchId: string;
      event: JobProgressEvent;
    };

    // Log different types of progress events
    const eventType = event.type; // "job" or "batch"
    const status = event.status;

    logger.debug(`${eventType} ${batchId} - ${status}:`, {
      id: event.id,
      message: event.message,
      progress: event.progress,
      metadata: {
        userId: event.metadata.userId,
        interfaceId: event.metadata.interfaceId,
        channelId: event.metadata.channelId,
      },
    });

    // Log batch-specific details if available
    if (event.batchDetails) {
      logger.debug(`Batch details for ${batchId}:`, {
        totalOperations: event.batchDetails.totalOperations,
        completedOperations: event.batchDetails.completedOperations,
        failedOperations: event.batchDetails.failedOperations,
        currentOperation: event.batchDetails.currentOperation,
        errors: event.batchDetails.errors,
      });
    }

    // Log job-specific details if available
    if (event.jobDetails) {
      logger.debug(`Job details for ${batchId}:`, {
        jobType: event.jobDetails.jobType,
        priority: event.jobDetails.priority,
        retryCount: event.jobDetails.retryCount,
      });
    }

    return { success: true };
  });

  logger.info("Subscribed to job progress events");
}
