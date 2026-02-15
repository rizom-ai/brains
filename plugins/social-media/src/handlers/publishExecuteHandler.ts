import type { Logger, PublishProvider, PublishImageData } from "@brains/utils";
import type {
  IEntityService,
  MessageSender,
  BaseEntity,
} from "@brains/plugins";
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

  constructor(config: PublishExecuteHandlerConfig) {
    this.sendMessage = config.sendMessage;
    this.logger = config.logger;
    this.entityService = config.entityService;
    this.providers = config.providers;
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

      // Fetch image data if coverImageId is present
      let imageData: PublishImageData | undefined;
      if (parsed.metadata.coverImageId) {
        imageData = await this.fetchImageData(parsed.metadata.coverImageId);
      }

      // Attempt to publish
      try {
        const result = await provider.publish(
          parsed.content,
          post.metadata,
          imageData,
        );

        // Update entity as published
        const publishedAt = new Date().toISOString();
        const platformPostId = result.id || undefined;
        const updatedFrontmatter = {
          ...parsed.metadata,
          status: "published" as const,
          publishedAt,
          ...(platformPostId && { platformPostId }),
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
            platformPostId,
          },
        });

        // Report success
        await this.reportSuccess(entityType, entityId, result.id);

        this.logger.info(`Post published successfully: ${entityId}`, {
          platform,
          platformPostId,
        });
      } catch (publishError) {
        const errorMessage =
          publishError instanceof Error
            ? publishError.message
            : String(publishError);

        // Update entity with error status (retry tracking is handled by RetryTracker)
        const updatedFrontmatter = {
          ...parsed.metadata,
          status: "failed" as const,
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
            status: "failed",
          },
        });

        // Report failure
        await this.reportFailure(entityType, entityId, errorMessage);

        this.logger.error(`Post publish failed: ${entityId}`, {
          platform,
          error: errorMessage,
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

  /**
   * Fetch image entity and extract binary data for publishing
   */
  private async fetchImageData(
    imageId: string,
  ): Promise<PublishImageData | undefined> {
    try {
      const image = await this.entityService.getEntity<BaseEntity>(
        "image",
        imageId,
      );

      if (!image) {
        this.logger.warn("Cover image not found", { imageId });
        return undefined;
      }

      // Image content is stored as data URL: data:image/png;base64,...
      const dataUrl = image.content;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

      if (!match?.[1] || !match[2]) {
        this.logger.warn("Invalid image data URL format", { imageId });
        return undefined;
      }

      const mimeType = match[1];
      const base64Data = match[2];
      const data = Buffer.from(base64Data, "base64");

      return { data, mimeType };
    } catch (error) {
      this.logger.warn("Failed to fetch cover image", { imageId, error });
      return undefined;
    }
  }
}
