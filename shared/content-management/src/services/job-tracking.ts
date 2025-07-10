import type { PluginContext } from "@brains/plugin-utils";
import { ProgressReporter, type ProgressCallback } from "@brains/utils";
import type { ContentGenerationJob } from "../types";

/**
 * Simple result type for content generation
 */
export interface ContentGenerationResult {
  jobId: string;
  entityId: string;
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Wait for multiple content generation jobs to complete with progress tracking
 */
export async function waitForContentJobs(
  jobs: ContentGenerationJob[],
  context: PluginContext,
  timeoutMs: number = 60000,
  progressCallback?: ProgressCallback,
): Promise<ContentGenerationResult[]> {
  const reporter = ProgressReporter.from(progressCallback);
  const total = jobs.length;
  let completed = 0;

  // Start heartbeat for long operations
  reporter?.startHeartbeat("Processing content generation jobs...", 5000);

  try {
    // Report initial progress
    await reporter?.report({
      message: "Starting content generation",
      progress: 0,
      total,
    });

    // Wait for all jobs in parallel
    const results = await Promise.all(
      jobs.map(async (job): Promise<ContentGenerationResult> => {
        try {
          const content = await context.waitForJob(job.jobId, timeoutMs);

          // Update progress
          completed++;
          await reporter?.report({
            message: `Generated content for ${job.sectionId}`,
            progress: completed,
            total,
          });

          return {
            jobId: job.jobId,
            entityId: job.entityId,
            success: true,
            content: String(content),
          };
        } catch (error) {
          // Still update progress even on failure
          completed++;
          await reporter?.report({
            message: `Failed to generate ${job.sectionId}`,
            progress: completed,
            total,
          });

          return {
            jobId: job.jobId,
            entityId: job.entityId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return results;
  } finally {
    // Always stop heartbeat
    reporter?.stopHeartbeat();
  }
}

/**
 * Get the current status of content generation jobs
 */
export async function getContentJobStatuses(
  jobIds: string[],
  context: PluginContext,
): Promise<Map<string, { status: string; error?: string }>> {
  const statuses = new Map<string, { status: string; error?: string }>();

  await Promise.all(
    jobIds.map(async (jobId) => {
      const status = await context.getJobStatus(jobId);
      if (status) {
        statuses.set(jobId, {
          status: status.status,
          ...(status.error && { error: status.error }),
        });
      }
    }),
  );

  return statuses;
}
