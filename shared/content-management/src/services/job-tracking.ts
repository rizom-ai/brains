import type { PluginContext } from "@brains/plugin-utils";

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
