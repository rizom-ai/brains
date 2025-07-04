import type { Logger } from "@brains/types";
import type { PluginContext } from "@brains/plugin-utils";
import type { ContentGenerationJob } from "../types";
import type {
  ProgressCallback,
  ContentGenerationResult,
} from "../services/job-tracking";

/**
 * Utility function for waiting on ContentGenerationJob arrays
 * Provides a convenient wrapper around JobTrackingService functionality
 */
export async function waitForContentJobs(
  jobs: ContentGenerationJob[],
  pluginContext: PluginContext,
  logger: Logger,
  progressCallback?: ProgressCallback,
  timeoutMs: number = 60000,
): Promise<ContentGenerationResult[]> {
  if (jobs.length === 0) {
    logger.debug("No content jobs to wait for");
    return [];
  }

  logger.info("Waiting for content generation jobs", {
    jobCount: jobs.length,
    timeoutMs,
  });

  const startTime = Date.now();
  const completed: ContentGenerationJob[] = [];
  const failed: ContentGenerationJob[] = [];
  const results: ContentGenerationResult[] = [];

  let pollCount = 0;
  const pollInterval = Math.min(1000, timeoutMs / 60); // Poll every second, max 60 times

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      const timeoutError = new Error(
        `Content jobs timeout after ${timeoutMs}ms. Completed: ${completed.length}, Failed: ${failed.length}, Pending: ${jobs.length - completed.length - failed.length}`,
      );
      logger.error("Content jobs timeout", {
        timeoutMs,
        totalJobs: jobs.length,
        completed: completed.length,
        failed: failed.length,
        pending: jobs.length - completed.length - failed.length,
      });
      reject(timeoutError);
    }, timeoutMs);

    const checkJobs = async (): Promise<void> => {
      try {
        pollCount++;
        logger.debug("Polling content job statuses", {
          pollCount,
          interval: pollInterval,
        });

        // Check status of each pending job
        for (const job of jobs) {
          if (
            completed.some((c) => c.jobId === job.jobId) ||
            failed.some((f) => f.jobId === job.jobId)
          ) {
            continue; // Already processed
          }

          try {
            // Check job status using PluginContext
            const jobStatus = await pluginContext.getJobStatus(job.jobId);

            if (!jobStatus) {
              logger.warn("Content job not found", { jobId: job.jobId });
              failed.push(job);
              results.push({
                jobId: job.jobId,
                entityId: job.entityId,
                success: false,
                error: "Job not found",
                duration: Date.now() - startTime,
              });
              continue;
            }

            if (jobStatus.status === "completed") {
              completed.push(job);
              results.push({
                jobId: job.jobId,
                entityId: job.entityId,
                success: true,
                ...(jobStatus.result && { content: jobStatus.result }),
                duration: Date.now() - startTime,
              });

              logger.debug("Content job completed", {
                jobId: job.jobId,
                entityId: job.entityId,
              });
            } else if (jobStatus.status === "failed") {
              failed.push(job);
              results.push({
                jobId: job.jobId,
                entityId: job.entityId,
                success: false,
                error: jobStatus.error ?? "Unknown error",
                duration: Date.now() - startTime,
              });

              logger.warn("Content job failed", {
                jobId: job.jobId,
                entityId: job.entityId,
                error: jobStatus.error,
              });
            }
            // For "pending" or "processing", continue waiting
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error("Failed to check content job status", {
              jobId: job.jobId,
              error: errorMessage,
            });

            failed.push(job);
            results.push({
              jobId: job.jobId,
              entityId: job.entityId,
              success: false,
              error: errorMessage,
              duration: Date.now() - startTime,
            });
          }
        }

        // Call progress callback if provided
        if (progressCallback) {
          progressCallback({
            current: completed.length + failed.length,
            total: jobs.length,
            message: `Processing content jobs: ${completed.length} completed, ${failed.length} failed, ${jobs.length - completed.length - failed.length} pending`,
            completed,
            failed,
          });
        }

        // Check if all jobs are complete
        if (completed.length + failed.length >= jobs.length) {
          clearTimeout(timeoutHandle);

          logger.info("All content generation jobs completed", {
            totalJobs: jobs.length,
            successful: completed.length,
            failed: failed.length,
            duration: Date.now() - startTime,
          });

          resolve(results);
          return;
        }

        // Continue polling
        setTimeout(checkJobs, pollInterval);
      } catch (error) {
        clearTimeout(timeoutHandle);
        const errorMessage = `Content job polling failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error("Content job polling failed", { error: errorMessage });
        reject(new Error(errorMessage));
      }
    };

    // Start polling
    checkJobs().catch((error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}

/**
 * Get current status summary for content generation jobs
 * Provides a snapshot of job states without waiting
 */
export async function getContentJobStatuses(
  jobs: ContentGenerationJob[],
  pluginContext: PluginContext,
  logger: Logger,
): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  jobs: Array<{
    jobId: string;
    sectionId: string;
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  }>;
}> {
  logger.debug("Getting content job statuses", { jobCount: jobs.length });

  const summary = {
    total: jobs.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    jobs: [] as Array<{
      jobId: string;
      sectionId: string;
      status: "pending" | "processing" | "completed" | "failed";
      error?: string;
    }>,
  };

  try {
    for (const job of jobs) {
      const status = await checkJobStatus(job.jobId, pluginContext, logger);

      summary.jobs.push({
        jobId: job.jobId,
        sectionId: job.sectionId,
        status: status.status,
        ...(status.error && { error: status.error }),
      });

      switch (status.status) {
        case "pending":
          summary.pending++;
          break;
        case "processing":
          summary.processing++;
          break;
        case "completed":
          summary.completed++;
          break;
        case "failed":
          summary.failed++;
          break;
      }
    }
  } catch (error) {
    logger.error("Failed to get content job statuses", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return summary;
}

/**
 * Helper function to check individual job status
 */
async function checkJobStatus(
  jobId: string,
  pluginContext: PluginContext,
  logger: Logger,
): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
}> {
  try {
    const jobStatus = await pluginContext.getJobStatus(jobId);

    if (!jobStatus) {
      logger.warn("Content job not found", { jobId });
      return {
        status: "failed",
        error: "Job not found",
      };
    }

    return {
      status: jobStatus.status,
      ...(jobStatus.result && { result: jobStatus.result }),
      ...(jobStatus.error && { error: jobStatus.error }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to check content job status", {
      jobId,
      error: errorMessage,
    });

    return {
      status: "failed",
      error: errorMessage,
    };
  }
}
