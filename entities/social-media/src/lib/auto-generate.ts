import { getErrorMessage } from "@brains/utils/error";
import { type EntityPluginContext } from "@brains/plugins";
import { GENERATE_CHANNELS } from "@brains/contracts";
import { socialPostAdapter } from "../adapters/social-post-adapter";
import type { Logger } from "@brains/utils/logger";

/**
 * Subscribe to generate:execute to handle explicitly scheduled generation.
 * This command workflow is not a projection and does not enter the derivation graph.
 */
export function subscribeToGenerateExecute(
  context: EntityPluginContext,
  logger: Logger,
): void {
  context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
    GENERATE_CHANNELS.execute,
    async (msg) => {
      const { entityType } = msg.payload;

      if (entityType !== "social-post") {
        return { success: true };
      }

      logger.info("Received generate:execute for social-post");

      try {
        const recentPosts = await context.entityService.listEntities({
          entityType: "post",
          options: {
            filter: { metadata: { status: "published" } },
            limit: 5,
          },
        });

        if (recentPosts.length === 0) {
          logger.info("No published posts found for social post generation");
          await context.messaging.send({
            type: GENERATE_CHANNELS.reportFailure,
            payload: {
              entityType: "social-post",
              error: "No published posts available for social post generation",
            },
          });
          return { success: true };
        }

        let sourcePost = null;
        for (const post of recentPosts) {
          const existingPosts = await context.entityService.listEntities({
            entityType: "social-post",
            options: {
              filter: {
                metadata: {
                  sourceEntityType: "post",
                  sourceEntityId: post.id,
                },
              },
              limit: 1,
            },
          });

          if (existingPosts.length === 0) {
            sourcePost = post;
            break;
          }
        }

        if (!sourcePost) {
          logger.info("All recent posts already have social posts");
          await context.messaging.send({
            type: GENERATE_CHANNELS.reportFailure,
            payload: {
              entityType: "social-post",
              error: "All recent posts already have social posts generated",
            },
          });
          return { success: true };
        }

        const jobId = await context.jobs.enqueue({
          type: `${socialPostAdapter.entityType}:generation`,
          data: {
            sourceEntityType: "post",
            sourceEntityId: sourcePost.id,
            platform: "linkedin",
            addToQueue: false,
          },
          toolContext: {
            interfaceType: "job",
            actor: {
              kind: "service",
              serviceId: "social-media-auto-generate",
            },
          },
        });

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
        await context.messaging.send({
          type: GENERATE_CHANNELS.reportFailure,
          payload: {
            entityType: "social-post",
            error: errorMessage,
          },
        });
        return { success: true };
      }
    },
  );

  logger.debug("Subscribed to generate:execute messages");
}
