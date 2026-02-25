import { getErrorMessage } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";

/**
 * Subscribe to entity:updated to trigger auto-generation when blog posts are queued.
 */
export function subscribeToEntityUpdatedForAutoGenerate(
  context: ServicePluginContext,
  logger: Logger,
): void {
  context.messaging.subscribe<
    {
      entityType: string;
      entityId: string;
      entity: { metadata?: { status?: string } };
    },
    { success: boolean }
  >("entity:updated", async (msg) => {
    const { entityType, entityId, entity } = msg.payload;

    if (entityType !== "post") {
      return { success: true };
    }

    const status = entity.metadata?.status;
    if (status !== "queued") {
      return { success: true };
    }

    try {
      const existingPosts = await context.entityService.listEntities(
        "social-post",
        {
          filter: {
            metadata: {
              sourceEntityType: "post",
              sourceEntityId: entityId,
            },
          },
          limit: 1,
        },
      );

      if (existingPosts.length > 0) {
        logger.debug(
          `Social post already exists for ${entityId}, skipping auto-generate`,
        );
        return { success: true };
      }

      await context.messaging.send("social:auto-generate", {
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        platform: "linkedin",
      });

      logger.info(
        `Auto-generate social post triggered for queued post ${entityId}`,
      );
      return { success: true };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error(`Failed to trigger auto-generate for ${entityId}:`, {
        error: errorMessage,
      });
      return { success: true };
    }
  });

  logger.debug("Subscribed to entity:updated for auto-generation");
}

/**
 * Subscribe to social:auto-generate to enqueue generation jobs.
 */
export function subscribeToAutoGenerate(
  context: ServicePluginContext,
  logger: Logger,
): void {
  context.messaging.subscribe<
    {
      sourceEntityType: string;
      sourceEntityId: string;
      platform: string;
    },
    { success: boolean; jobId?: string }
  >("social:auto-generate", async (msg) => {
    const { sourceEntityType, sourceEntityId, platform } = msg.payload;

    try {
      const jobId = await context.jobs.enqueue(
        "social-media:generation",
        {
          sourceEntityType,
          sourceEntityId,
          platform,
          addToQueue: false,
        },
        { interfaceType: "job", userId: "system" },
      );

      logger.info(
        `Social post generation job enqueued for ${sourceEntityType}/${sourceEntityId}`,
        { jobId },
      );

      return { success: true, jobId };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error(
        `Failed to enqueue social post generation for ${sourceEntityId}:`,
        { error: errorMessage },
      );
      return { success: false };
    }
  });

  logger.debug("Subscribed to social:auto-generate messages");
}

/**
 * Subscribe to generate:execute to handle scheduled generation triggers.
 */
export function subscribeToGenerateExecute(
  context: ServicePluginContext,
  logger: Logger,
): void {
  context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
    "generate:execute",
    async (msg) => {
      const { entityType } = msg.payload;

      if (entityType !== "social-post") {
        return { success: true };
      }

      logger.info("Received generate:execute for social-post");

      try {
        const recentPosts = await context.entityService.listEntities("post", {
          filter: { metadata: { status: "published" } },
          limit: 5,
        });

        if (recentPosts.length === 0) {
          logger.info("No published posts found for social post generation");
          await context.messaging.send("generate:report:failure", {
            entityType: "social-post",
            error: "No published posts available for social post generation",
          });
          return { success: true };
        }

        let sourcePost = null;
        for (const post of recentPosts) {
          const existingPosts = await context.entityService.listEntities(
            "social-post",
            {
              filter: {
                metadata: {
                  sourceEntityType: "post",
                  sourceEntityId: post.id,
                },
              },
              limit: 1,
            },
          );

          if (existingPosts.length === 0) {
            sourcePost = post;
            break;
          }
        }

        if (!sourcePost) {
          logger.info("All recent posts already have social posts");
          await context.messaging.send("generate:report:failure", {
            entityType: "social-post",
            error: "All recent posts already have social posts generated",
          });
          return { success: true };
        }

        const jobId = await context.jobs.enqueue(
          "social-media:generation",
          {
            sourceEntityType: "post",
            sourceEntityId: sourcePost.id,
            platform: "linkedin",
            addToQueue: false,
          },
          { interfaceType: "job", userId: "system" },
        );

        logger.info("Social post generation job queued", {
          jobId,
          sourcePostId: sourcePost.id,
        });

        return { success: true };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error("Failed to handle generate:execute:", {
          error: errorMessage,
        });
        await context.messaging.send("generate:report:failure", {
          entityType: "social-post",
          error: errorMessage,
        });
        return { success: true };
      }
    },
  );

  logger.debug("Subscribed to generate:execute messages");
}
