import type { Logger, PublishProvider } from "@brains/utils";
import type { IEntityService, MessageSender } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { SocialPost } from "../schemas/social-post";
import { socialPostFrontmatterSchema } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";

export interface PublishExecutePayload {
  entityType: string;
  entityId: string;
}

export interface PublishExecuteHandlerConfig {
  sendMessage: MessageSender;
  logger: Logger;
  entityService: IEntityService;
  providers: Map<string, PublishProvider>;
  maxRetries: number;
}

/**
 * Handles publish:execute messages from the publish-service scheduler.
 * This replaces the job-based publishing with message-driven publishing.
 */
export class PublishExecuteHandler {
  private sendMessage: MessageSender;
  private logger: Logger;
  private entityService: IEntityService;
  private providers: Map<string, PublishProvider>;
  private maxRetries: number;

  constructor(config: PublishExecuteHandlerConfig) {
    this.sendMessage = config.sendMessage;
    this.logger = config.logger;
    this.entityService = config.entityService;
    this.providers = config.providers;
    this.maxRetries = config.maxRetries;
  }

  /**
   * Handle a publish:execute message
   */
  async handle(payload: PublishExecutePayload): Promise<void> {
    const { entityType, entityId } = payload;

    // Only handle social-post entities
    if (entityType !== "social-post") {
      return;
    }

    this.logger.debug("Handling publish:execute", { entityId });

    try {
      // Fetch the entity
      const post = await this.entityService.getEntity<SocialPost>(
        "social-post",
        entityId,
      );

      if (!post) {
        await this.reportFailure(
          entityType,
          entityId,
          `Post not found: ${entityId}`,
        );
        return;
      }

      // Skip if already published
      if (post.metadata.status === "published") {
        this.logger.debug("Post already published, skipping", { entityId });
        return;
      }

      // Get the provider for this platform
      const platform = post.metadata.platform;
      const provider = this.providers.get(platform);

      if (!provider) {
        await this.reportFailure(
          entityType,
          entityId,
          `No provider configured for platform: ${platform}`,
        );
        return;
      }

      // Parse the content
      const parsed = parseMarkdownWithFrontmatter(
        post.content,
        socialPostFrontmatterSchema,
      );

      // Attempt to publish
      try {
        const result = await provider.publish(parsed.content, post.metadata);

        // Update entity as published
        const publishedAt = new Date().toISOString();
        const { queueOrder: _queueOrder, ...metadataWithoutQueue } =
          parsed.metadata;
        const updatedFrontmatter = {
          ...metadataWithoutQueue,
          status: "published" as const,
          publishedAt,
          platformPostId: result.id,
          retryCount: parsed.metadata.retryCount ?? 0,
        };
        const updatedContent = socialPostAdapter.createPostContent(
          updatedFrontmatter,
          parsed.content,
        );

        await this.entityService.updateEntity({
          ...post,
          content: updatedContent,
          metadata: {
            ...post.metadata,
            status: "published",
            publishedAt,
            queueOrder: undefined,
          },
        });

        // Report success
        await this.reportSuccess(entityType, entityId, result.id);

        this.logger.info(`Post published successfully: ${entityId}`, {
          platform,
          platformPostId: result.id,
        });
      } catch (publishError) {
        const errorMessage =
          publishError instanceof Error
            ? publishError.message
            : String(publishError);

        // Update entity with error info
        const retryCount = (parsed.metadata.retryCount ?? 0) + 1;
        const updatedFrontmatter = {
          ...parsed.metadata,
          retryCount,
          lastError: errorMessage,
          status:
            retryCount >= this.maxRetries
              ? ("failed" as const)
              : parsed.metadata.status,
        };
        const updatedContent = socialPostAdapter.createPostContent(
          updatedFrontmatter,
          parsed.content,
        );

        await this.entityService.updateEntity({
          ...post,
          content: updatedContent,
          metadata: {
            ...post.metadata,
            lastError: errorMessage,
            status:
              retryCount >= this.maxRetries ? "failed" : post.metadata.status,
          },
        });

        // Report failure
        await this.reportFailure(entityType, entityId, errorMessage);

        this.logger.error(`Post publish failed: ${entityId}`, {
          platform,
          error: errorMessage,
          retryCount,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Unexpected error in publish handler", {
        entityId,
        error: errorMessage,
      });
      await this.reportFailure(entityType, entityId, errorMessage);
    }
  }

  /**
   * Report successful publish to the publish-service
   */
  private async reportSuccess(
    entityType: string,
    entityId: string,
    platformPostId: string,
  ): Promise<void> {
    await this.sendMessage("publish:report:success", {
      entityType,
      entityId,
      result: { id: platformPostId },
    });
  }

  /**
   * Report failed publish to the publish-pipeline
   */
  private async reportFailure(
    entityType: string,
    entityId: string,
    error: string,
  ): Promise<void> {
    await this.sendMessage("publish:report:failure", {
      entityType,
      entityId,
      error,
    });
  }
}
