import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import {
  PUBLISH_CHANNELS,
  type PublishProvider,
  type PublishResult,
} from "@brains/contracts";
import type {
  AttachmentFileResolver,
  MessageSender,
  EntityServiceClient,
  EntityPluginContext,
  ToolContext,
} from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  withPublishFiles,
} from "@brains/plugins";
import type { SocialPostFrontmatter } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostSchema,
} from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";

export interface PublishExecutePayload {
  entityType: string;
  entityId: string;
  authContext?: {
    interfaceType?: ToolContext["interfaceType"];
    actor?: ToolContext["actor"];
    userPermissionLevel?: ToolContext["userPermissionLevel"];
    authorization?: "user" | "system";
  };
}
export type PublishExecuteEntityService = Pick<
  EntityServiceClient,
  "getEntity" | "statAsset" | "fileAssets" | "updateEntity"
>;
export interface PublishExecuteHandlerConfig {
  sendMessage: MessageSender;
  logger: Logger;
  entityService: PublishExecuteEntityService;
  providers: Map<string, PublishProvider>;
  permissions: EntityPluginContext["permissions"];
  withAttachmentFile?: AttachmentFileResolver;
}

/** Message-driven publication. Claims prevent in-process replay, not durable
 * exactly-once delivery. Uncertain external sends require reconciliation.
 */
export class PublishExecuteHandler {
  private readonly config: PublishExecuteHandlerConfig;
  private readonly enteredAttempts = new Set<string>();
  private readonly activeEntities = new Set<string>();
  constructor(config: PublishExecuteHandlerConfig) {
    this.config = config;
  }

  async handle(payload: PublishExecutePayload): Promise<void> {
    const { entityType, entityId } = payload;
    if (entityType !== "social-post") return;
    const { permissions, entityService, logger, providers } = this.config;
    permissions.assertEntityActionAllowed(
      entityType,
      "publish",
      payload.authContext ?? { userPermissionLevel: "admin" },
    );
    if (this.activeEntities.has(entityId)) {
      logger.warn("Publish request is already active", { entityId });
      return;
    }
    this.activeEntities.add(entityId);
    const state: {
      entered: boolean;
      published: boolean;
      result?: PublishResult;
    } = { entered: false, published: false };
    try {
      const post = await entityService.getEntity(
        { entityType, id: entityId },
        socialPostSchema,
      );
      if (!post) {
        await this.reportFailure(
          entityType,
          entityId,
          `Post not found: ${entityId}`,
        );
        return;
      }
      if (post.metadata.status === "published") return;
      const platform = post.metadata.platform;
      const provider = providers.get(platform);
      if (!provider) {
        await this.reportFailure(
          entityType,
          entityId,
          `No provider configured for platform: ${platform}`,
        );
        return;
      }
      const parsed = parseMarkdownWithFrontmatter(
        post.content,
        socialPostFrontmatterSchema,
      );
      try {
        await withPublishFiles(
          {
            entityService,
            withAttachmentFile: this.config.withAttachmentFile,
            missingDocuments: "error",
          },
          parsed.metadata,
          async (files): Promise<void> => {
            const key = `${entityId}:${post.contentHash}`;
            if (this.enteredAttempts.has(key)) {
              state.entered = true;
              throw new Error(
                "Publish attempt already entered; reconcile its outcome before a new request",
              );
            }
            files.imageData?.signal.throwIfAborted();
            for (const file of files.documentData ?? [])
              file.signal.throwIfAborted();
            if (this.enteredAttempts.size >= 1024)
              throw new Error(
                "Unreconciled publication attempt capacity exceeded",
              );
            this.enteredAttempts.add(key);
            state.entered = true;
            const result = await provider.publish(
              parsed.content,
              post.metadata,
              files.imageData,
              files.documentData,
            );
            state.result = result;
            // Cancellation cannot retract the external acknowledgement. Persist it
            // inside the file scopes, without starting another external send.
            const publishedAt = new Date().toISOString();
            const platformPostId = result.id || undefined;
            const frontmatter: SocialPostFrontmatter = {
              ...parsed.metadata,
              status: "published",
              publishedAt,
              ...(platformPostId && { platformPostId }),
            };
            const acknowledgement = await entityService.updateEntity({
              entity: {
                ...post,
                content: socialPostAdapter.createPostContent(
                  frontmatter,
                  parsed.content,
                ),
                metadata: {
                  ...post.metadata,
                  status: "published",
                  publishedAt,
                  platformPostId,
                },
              },
            });
            if (acknowledgement.skipped)
              throw new Error(
                "External publication acknowledged but local status update was skipped; reconcile before retrying",
              );
            state.published = true;
            this.enteredAttempts.delete(key);
            await this.reportSuccess(entityType, entityId, result.id);
            logger.info(`Post published successfully: ${entityId}`, {
              platform,
              platformPostId,
            });
          },
        );
      } catch (error) {
        if (state.published) {
          logger.warn(
            "Post published but notification or file retirement failed",
            { entityId, result: state.result, error },
          );
          return;
        }
        if (!state.entered) {
          let updateFailure: { error: unknown } | undefined;
          try {
            const frontmatter: SocialPostFrontmatter = {
              ...parsed.metadata,
              status: "failed",
            };
            await entityService.updateEntity({
              entity: {
                ...post,
                content: socialPostAdapter.createPostContent(
                  frontmatter,
                  parsed.content,
                ),
                metadata: { ...post.metadata, status: "failed" },
              },
            });
          } catch (updateError) {
            updateFailure = { error: updateError };
          }
          if (updateFailure && !Object.is(error, updateFailure.error))
            throw new AggregateError(
              [error, updateFailure.error],
              "Publication preparation and failure update failed",
              { cause: error },
            );
        }
        throw error;
      }
    } catch (error) {
      logger.error("Publish handler failed; no automatic replay", {
        entityId,
        result: state.result,
        entered: state.entered,
        error,
      });
      let reportingFailure: { error: unknown } | undefined;
      try {
        await this.reportFailure(entityType, entityId, getErrorMessage(error));
      } catch (reportError) {
        reportingFailure = { error: reportError };
      }
      if (reportingFailure) {
        if (!Object.is(error, reportingFailure.error))
          throw new AggregateError(
            [error, reportingFailure.error],
            "Publication and failure reporting failed",
            { cause: error },
          );
        throw error;
      }
    } finally {
      this.activeEntities.delete(entityId);
    }
  }
  private async reportSuccess(
    entityType: string,
    entityId: string,
    platformPostId: string,
  ): Promise<void> {
    await this.config.sendMessage({
      type: PUBLISH_CHANNELS.reportSuccess,
      payload: { entityType, entityId, result: { id: platformPostId } },
    });
  }
  private async reportFailure(
    entityType: string,
    entityId: string,
    error: string,
  ): Promise<void> {
    await this.config.sendMessage({
      type: PUBLISH_CHANNELS.reportFailure,
      payload: { entityType, entityId, error, willRetry: false },
    });
  }
}
