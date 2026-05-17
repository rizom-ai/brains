import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type {
  PublishProvider,
  PublishImageData,
  PublishMediaData,
} from "@brains/contracts";
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

export interface AttachmentResolveRequest {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}

export type ResolveAttachmentFn = (
  request: AttachmentResolveRequest,
) => Promise<PublishMediaData | undefined>;

export interface PublishExecuteHandlerConfig {
  sendMessage: MessageSender;
  logger: Logger;
  entityService: IEntityService;
  providers: Map<string, PublishProvider>;
  /**
   * Optional attachment resolver. When set, posts with `sourceEntityType` /
   * `sourceEntityId` but no explicit `documents[]` will ask the registry for
   * `attachmentType: "carousel"` and use the result as the published document.
   */
  resolveAttachment?: ResolveAttachmentFn;
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
  private resolveAttachment: ResolveAttachmentFn | undefined;

  constructor(config: PublishExecuteHandlerConfig) {
    this.sendMessage = config.sendMessage;
    this.logger = config.logger;
    this.entityService = config.entityService;
    this.providers = config.providers;
    this.resolveAttachment = config.resolveAttachment;
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
      const post = await this.entityService.getEntity<SocialPost>({
        entityType: "social-post",
        id: entityId,
      });

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

      const requestedDocuments = parsed.metadata.documents ?? [];
      const explicitDocumentData =
        await this.fetchDocumentData(requestedDocuments);

      // Attempt to publish
      try {
        // If the post explicitly references documents but none could be
        // fetched, refuse to silently degrade to a text-only post — that
        // would mislead the user about what was published. Throw here so
        // the existing failed-publish path marks the entity as failed.
        if (
          requestedDocuments.length > 0 &&
          explicitDocumentData.length === 0
        ) {
          throw new Error(
            `Refusing to publish: ${requestedDocuments.length} document(s) referenced but none could be fetched`,
          );
        }

        // When no explicit documents are referenced, try to resolve a
        // source-derived attachment (e.g. a deck-owned carousel).
        const sourceDocumentData =
          requestedDocuments.length === 0
            ? await this.resolveSourceAttachment(parsed.metadata)
            : [];

        const documentData =
          explicitDocumentData.length > 0
            ? explicitDocumentData
            : sourceDocumentData;

        const result = documentData.length
          ? await provider.publish(
              parsed.content,
              post.metadata,
              imageData,
              documentData,
            )
          : await provider.publish(parsed.content, post.metadata, imageData);

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
          entity: {
            ...post,
            content: updatedContent,
            metadata: {
              ...post.metadata,
              status: "published",
              publishedAt,
              platformPostId,
            },
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
          entity: {
            ...post,
            content: updatedContent,
            metadata: {
              ...post.metadata,
              status: "failed",
            },
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
      const errorMessage = getErrorMessage(error);
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
    await this.sendMessage({
      type: "publish:report:success",
      payload: {
        entityType,
        entityId,
        result: { id: platformPostId },
      },
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
    await this.sendMessage({
      type: "publish:report:failure",
      payload: {
        entityType,
        entityId,
        error,
      },
    });
  }

  /**
   * Resolve a source-derived carousel attachment when the post carries
   * `sourceEntityType` / `sourceEntityId` and an attachment provider is
   * registered for that source.
   */
  private async resolveSourceAttachment(metadata: {
    sourceEntityType?: string | undefined;
    sourceEntityId?: string | undefined;
  }): Promise<PublishMediaData[]> {
    if (
      !this.resolveAttachment ||
      !metadata.sourceEntityType ||
      !metadata.sourceEntityId
    ) {
      return [];
    }

    const attachment = await this.resolveAttachment({
      sourceEntityType: metadata.sourceEntityType,
      sourceEntityId: metadata.sourceEntityId,
      attachmentType: "carousel",
    });
    return attachment ? [attachment] : [];
  }

  /**
   * Fetch document entities and extract binary PDF data for publishing
   */
  private async fetchDocumentData(
    documents: Array<{ id: string }> | undefined,
  ): Promise<PublishMediaData[]> {
    if (!documents?.length) {
      return [];
    }

    const result: PublishMediaData[] = [];
    for (const documentRef of documents) {
      const documentData = await this.fetchSingleDocumentData(documentRef.id);
      if (documentData) {
        result.push(documentData);
      }
    }
    return result;
  }

  private async fetchSingleDocumentData(
    documentId: string,
  ): Promise<PublishMediaData | undefined> {
    try {
      const document = await this.entityService.getEntity<BaseEntity>({
        entityType: "document",
        id: documentId,
      });

      if (!document) {
        this.logger.warn("Document not found", { documentId });
        return undefined;
      }

      const match = document.content.match(
        /^data:application\/pdf;base64,(.+)$/,
      );
      if (!match?.[1]) {
        this.logger.warn("Invalid document data URL format", { documentId });
        return undefined;
      }

      const filename =
        typeof document.metadata["filename"] === "string"
          ? document.metadata["filename"]
          : `${documentId}.pdf`;

      return {
        type: "document",
        data: Buffer.from(match[1], "base64"),
        mimeType: "application/pdf",
        filename,
      };
    } catch (error) {
      this.logger.warn("Failed to fetch document", { documentId, error });
      return undefined;
    }
  }

  /**
   * Fetch image entity and extract binary data for publishing
   */
  private async fetchImageData(
    imageId: string,
  ): Promise<PublishImageData | undefined> {
    try {
      const image = await this.entityService.getEntity<BaseEntity>({
        entityType: "image",
        id: imageId,
      });

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
