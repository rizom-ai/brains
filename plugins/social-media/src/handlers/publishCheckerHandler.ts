import { BaseJobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { SocialPost } from "../schemas/social-post";
import type { SocialMediaConfig } from "../config";

/**
 * Input schema for publish checker job (empty - no params needed)
 */
export const publishCheckerJobSchema = z.object({});

export type PublishCheckerJobData = z.infer<typeof publishCheckerJobSchema>;

/**
 * Result schema for publish checker job
 */
export const publishCheckerResultSchema = z.object({
  success: z.boolean(),
  publishJobId: z.string().optional(),
  nextCheckScheduled: z.boolean(),
  error: z.string().optional(),
});

export type PublishCheckerResult = z.infer<typeof publishCheckerResultSchema>;

/**
 * Self-re-enqueueing job handler that checks for queued posts and triggers publishing
 * Acts as a cron-like scheduler for automatic post publishing
 */
export class PublishCheckerJobHandler extends BaseJobHandler<
  "publish-checker",
  PublishCheckerJobData,
  PublishCheckerResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
    private config: SocialMediaConfig,
    private pluginId: string,
  ) {
    super(logger, {
      schema: publishCheckerJobSchema,
      jobTypeName: "social-post-publish-checker",
    });
  }

  async process(
    _data: PublishCheckerJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<PublishCheckerResult> {
    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Checking publish queue",
      });

      // Skip if publishing is disabled
      if (!this.config.enabled) {
        await this.scheduleNextCheck();
        return {
          success: true,
          nextCheckScheduled: true,
        };
      }

      // Get next queued post (lowest queueOrder)
      const queuedPosts =
        await this.context.entityService.listEntities<SocialPost>(
          "social-post",
          {
            filter: { metadata: { status: "queued" } },
            sortFields: [{ field: "queueOrder", direction: "asc" }],
            limit: 1,
          },
        );

      const nextPost = queuedPosts[0];

      await progressReporter.report({
        progress: 50,
        total: 100,
        message: nextPost ? "Found post to publish" : "No posts in queue",
      });

      let publishJobId: string | undefined;

      if (nextPost) {
        // Enqueue publish job for the next post
        // Note: We pass null as toolContext since this is a background job
        publishJobId = await this.context.enqueueJob(
          "publish",
          { postId: nextPost.id },
          null,
          {
            source: `${this.pluginId}:publish-checker`,
            metadata: {
              operationType: "content_operations",
              operationTarget: "social-post",
            },
          },
        );

        this.logger.info("Enqueued publish job from checker", {
          postId: nextPost.id,
          publishJobId,
        });
      }

      // Schedule next check
      await this.scheduleNextCheck();

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: publishJobId
          ? `Publish job enqueued, next check in ${this.config.publishInterval}ms`
          : `No posts to publish, next check in ${this.config.publishInterval}ms`,
      });

      return {
        success: true,
        publishJobId,
        nextCheckScheduled: true,
      };
    } catch (error) {
      this.logger.error("Publish checker job failed", {
        error,
        jobId,
      });

      // Still try to schedule next check even on error
      try {
        await this.scheduleNextCheck();
      } catch (scheduleError) {
        this.logger.error("Failed to schedule next check", { scheduleError });
      }

      return {
        success: false,
        nextCheckScheduled: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Schedule the next publish check with configured delay
   * Uses deduplication to prevent multiple concurrent checkers
   */
  private async scheduleNextCheck(): Promise<void> {
    await this.context.enqueueJob(
      "publish-checker",
      {},
      null, // No tool context for background jobs
      {
        source: `${this.pluginId}:publish-checker`,
        delayMs: this.config.publishInterval,
        deduplication: "skip", // Skip if already queued
        metadata: {
          operationType: "data_processing",
          operationTarget: "publish-checker",
        },
      },
    );
  }

  protected override summarizeDataForLog(
    _data: PublishCheckerJobData,
  ): Record<string, unknown> {
    return {
      publishInterval: this.config.publishInterval,
      enabled: this.config.enabled,
    };
  }
}
