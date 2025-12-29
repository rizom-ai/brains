import { BaseJobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { SocialPost } from "../schemas/social-post";
import { socialPostFrontmatterSchema } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";
import type { SocialMediaConfig } from "../config";
import type { SocialMediaProvider } from "../lib/provider";

/**
 * Input schema for publish job
 */
export const publishJobSchema = z.object({
  postId: z.string(),
});

export type PublishJobData = z.infer<typeof publishJobSchema>;

/**
 * Result schema for publish job
 */
export const publishResultSchema = z.object({
  success: z.boolean(),
  platformPostId: z.string().optional(),
  publishedAt: z.string().optional(),
  error: z.string().optional(),
});

export type PublishResult = z.infer<typeof publishResultSchema>;

/**
 * Job handler for publishing social posts to platforms
 */
export class PublishJobHandler extends BaseJobHandler<
  "publish",
  PublishJobData,
  PublishResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
    private config: SocialMediaConfig,
    private providers: Map<string, SocialMediaProvider>,
  ) {
    super(logger, {
      schema: publishJobSchema,
      jobTypeName: "social-post-publish",
    });
  }

  async process(
    data: PublishJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<PublishResult> {
    const { postId } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting publish process",
      });

      // Get the post
      const post = await this.context.entityService.getEntity<SocialPost>(
        "social-post",
        postId,
      );

      if (!post) {
        return {
          success: false,
          error: `Post not found: ${postId}`,
        };
      }

      // Parse frontmatter
      const parsed = parseMarkdownWithFrontmatter(
        post.content,
        socialPostFrontmatterSchema,
      );

      // Check if already published
      if (post.metadata.status === "published") {
        return {
          success: false,
          error: "Post is already published",
        };
      }

      const platform = post.metadata.platform;
      const provider = this.providers.get(platform);

      if (!provider) {
        return {
          success: false,
          error: `No provider configured for platform: ${platform}`,
        };
      }

      await progressReporter.report({
        progress: 30,
        total: 100,
        message: `Publishing to ${platform}`,
      });

      // Attempt to publish
      let platformPostId: string;
      const publishedAt = new Date().toISOString();

      try {
        const result = await provider.createPost(parsed.metadata.content);
        platformPostId = result.postId;
      } catch (publishError) {
        // Handle publish failure
        const retryCount = (parsed.metadata.retryCount ?? 0) + 1;
        const errorMessage =
          publishError instanceof Error
            ? publishError.message
            : String(publishError);

        // Check if max retries exceeded
        if (retryCount >= this.config.maxRetries) {
          // Mark as failed
          const updatedFrontmatter = {
            ...parsed.metadata,
            status: "failed" as const,
            retryCount,
            lastError: errorMessage,
          };
          const updatedContent = socialPostAdapter.createPostContent(
            updatedFrontmatter,
            parsed.content,
          );

          await this.context.entityService.updateEntity({
            ...post,
            content: updatedContent,
            metadata: {
              ...post.metadata,
              status: "failed",
            },
          });

          return {
            success: false,
            error: `Publish failed after ${retryCount} attempts: ${errorMessage}`,
          };
        }

        // Update retry count and keep as queued
        const updatedFrontmatter = {
          ...parsed.metadata,
          retryCount,
          lastError: errorMessage,
        };
        const updatedContent = socialPostAdapter.createPostContent(
          updatedFrontmatter,
          parsed.content,
        );

        await this.context.entityService.updateEntity({
          ...post,
          content: updatedContent,
        });

        return {
          success: false,
          error: `Publish failed (attempt ${retryCount}/${this.config.maxRetries}): ${errorMessage}`,
        };
      }

      await progressReporter.report({
        progress: 70,
        total: 100,
        message: "Updating post status",
      });

      // Update post as published
      const updatedFrontmatter = {
        ...parsed.metadata,
        status: "published" as const,
        publishedAt,
        platformPostId,
        queueOrder: undefined, // Remove from queue
        retryCount: parsed.metadata.retryCount ?? 0, // Ensure retryCount is always set
      };
      const updatedContent = socialPostAdapter.createPostContent(
        updatedFrontmatter,
        parsed.content,
      );

      await this.context.entityService.updateEntity({
        ...post,
        content: updatedContent,
        metadata: {
          ...post.metadata,
          status: "published",
          publishedAt,
          queueOrder: undefined,
        },
      });

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Published to ${platform}`,
      });

      return {
        success: true,
        platformPostId,
        publishedAt,
      };
    } catch (error) {
      this.logger.error("Publish job failed", {
        error,
        jobId,
        data,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected override summarizeDataForLog(
    data: PublishJobData,
  ): Record<string, unknown> {
    return {
      postId: data.postId,
    };
  }
}
