import type { Logger } from "@brains/types";
import type { PluginContext } from "@brains/plugin-utils";
import type { ContentGenerationJob, JobStatusSummary } from "../types";

/**
 * Progress callback for job tracking operations
 */
export type ProgressCallback = (progress: {
  current: number;
  total: number;
  message: string;
  completed: ContentGenerationJob[];
  failed: ContentGenerationJob[];
}) => void;

/**
 * Result of a completed content generation job
 */
export interface ContentGenerationResult {
  jobId: string;
  entityId: string;
  success: boolean;
  content?: string;
  error?: string;
  duration?: number;
}

/**
 * Service for tracking and monitoring async content generation jobs
 */
export class JobTrackingService {
  private static instance: JobTrackingService | null = null;

  // Singleton access
  public static getInstance(
    pluginContext: PluginContext,
    logger: Logger,
  ): JobTrackingService {
    JobTrackingService.instance ??= new JobTrackingService(
      pluginContext,
      logger,
    );
    return JobTrackingService.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    JobTrackingService.instance = null;
  }

  // Isolated instance creation
  public static createFresh(
    pluginContext: PluginContext,
    logger: Logger,
  ): JobTrackingService {
    return new JobTrackingService(pluginContext, logger);
  }

  // Private constructor to enforce factory methods
  private constructor(
    private readonly pluginContext: PluginContext,
    private readonly logger: Logger,
  ) {}

  /**
   * Wait for content generation jobs to complete with progress tracking
   */
  async waitForContentJobs(
    jobs: ContentGenerationJob[],
    progressCallback?: ProgressCallback,
    timeoutMs: number = 60000,
  ): Promise<ContentGenerationResult[]> {
    this.logger.info("Starting to track content generation jobs", {
      jobCount: jobs.length,
      timeoutMs,
    });

    if (jobs.length === 0) {
      this.logger.debug("No jobs to track");
      return [];
    }

    const results: ContentGenerationResult[] = [];
    const completed: ContentGenerationJob[] = [];
    const failed: ContentGenerationJob[] = [];
    const startTime = Date.now();

    // Set up polling interval
    const pollInterval = Math.min(1000, timeoutMs / 20); // Poll every second or 1/20th of timeout
    let pollCount = 0;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.logger.error("Content job tracking timed out", {
          timeoutMs,
          completedJobs: completed.length,
          totalJobs: jobs.length,
          pollCount,
        });
        reject(new Error(`Job tracking timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const checkJobs = async (): Promise<void> => {
        try {
          pollCount++;
          this.logger.debug("Polling job statuses", {
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
              // Use the plugin context to check job status
              // This assumes the PluginContext has a method to check job status
              // Implementation will depend on the actual job queue system
              const jobStatus = await this.checkJobStatus(job.jobId);

              if (jobStatus.status === "completed") {
                completed.push(job);
                results.push({
                  jobId: job.jobId,
                  entityId: job.entityId,
                  success: true,
                  ...(jobStatus.result?.content && {
                    content: jobStatus.result.content,
                  }),
                  duration: Date.now() - startTime,
                });

                this.logger.debug("Content generation job completed", {
                  jobId: job.jobId,
                  entityId: job.entityId,
                });
              } else if (jobStatus.status === "failed") {
                failed.push(job);
                results.push({
                  jobId: job.jobId,
                  entityId: job.entityId,
                  success: false,
                  error: jobStatus.error ?? "Job failed",
                  duration: Date.now() - startTime,
                });

                this.logger.error("Content generation job failed", {
                  jobId: job.jobId,
                  entityId: job.entityId,
                  error: jobStatus.error,
                });
              }
            } catch (error) {
              this.logger.error("Error checking job status", {
                jobId: job.jobId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Call progress callback if provided
          if (progressCallback) {
            progressCallback({
              current: completed.length + failed.length,
              total: jobs.length,
              message: `Processed ${completed.length + failed.length}/${jobs.length} jobs`,
              completed: [...completed],
              failed: [...failed],
            });
          }

          // Check if all jobs are complete
          if (completed.length + failed.length >= jobs.length) {
            clearTimeout(timeoutHandle);

            this.logger.info("All content generation jobs completed", {
              totalJobs: jobs.length,
              successful: completed.length,
              failed: failed.length,
              duration: Date.now() - startTime,
              pollCount,
            });

            resolve(results);
            return;
          }

          // Continue polling
          void setTimeout(checkJobs, pollInterval);
        } catch (error) {
          clearTimeout(timeoutHandle);
          this.logger.error("Error during job tracking", {
            error: error instanceof Error ? error.message : String(error),
            pollCount,
          });
          reject(error);
        }
      };

      // Start polling
      void checkJobs();
    });
  }

  /**
   * Get current status summary for content generation jobs
   */
  async getContentJobStatuses(
    jobs: ContentGenerationJob[],
  ): Promise<JobStatusSummary> {
    this.logger.debug("Getting status summary for content jobs", {
      jobCount: jobs.length,
    });

    const summary: JobStatusSummary = {
      total: jobs.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      jobs: [],
    };

    try {
      for (const job of jobs) {
        const status = await this.checkJobStatus(job.jobId);

        summary.jobs.push({
          jobId: job.jobId,
          sectionId: job.sectionId,
          status: status.status,
          ...(status.error && { error: status.error }),
        });

        // Update counters
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
      this.logger.error("Error getting job statuses", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return summary;
  }

  /**
   * Check the status of a specific job using the plugin context
   */
  private async checkJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    result?: { content: string };
    error?: string;
  }> {
    this.logger.debug("Checking job status", { jobId });

    try {
      // Use the plugin context to check job status
      const jobStatus = await this.pluginContext.getJobStatus(jobId);

      if (!jobStatus) {
        this.logger.warn("Job not found", { jobId });
        return {
          status: "failed",
          error: "Job not found",
        };
      }

      return {
        status: jobStatus.status,
        ...(jobStatus.result && { result: { content: jobStatus.result } }),
        ...(jobStatus.error && { error: jobStatus.error }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to check job status", {
        jobId,
        error: errorMessage,
      });

      return {
        status: "failed",
        error: errorMessage,
      };
    }
  }
}
