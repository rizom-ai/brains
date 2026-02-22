import type { ServicePluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import { blogPostAdapter } from "../adapters/blog-post-adapter";

export async function registerWithPublishPipeline(
  context: ServicePluginContext,
  logger: Logger,
): Promise<void> {
  const internalProvider = {
    name: "internal",
    publish: async (): Promise<{ id: string }> => {
      return { id: "internal" };
    },
  };

  await context.messaging.send("publish:register", {
    entityType: "post",
    provider: internalProvider,
  });

  logger.info("Registered post with publish-pipeline");
}

export function subscribeToPublishExecute(
  context: ServicePluginContext,
  logger: Logger,
): void {
  context.messaging.subscribe<
    { entityType: string; entityId: string },
    { success: boolean }
  >("publish:execute", async (msg) => {
    const { entityType, entityId } = msg.payload;

    if (entityType !== "post") {
      return { success: true };
    }

    try {
      const post = await context.entityService.getEntity<BlogPost>(
        "post",
        entityId,
      );

      if (!post) {
        await context.messaging.send("publish:report:failure", {
          entityType,
          entityId,
          error: `Post not found: ${entityId}`,
        });
        return { success: true };
      }

      if (post.metadata.status === "published") {
        logger.debug(`Post already published: ${entityId}`);
        return { success: true };
      }

      const parsed = parseMarkdownWithFrontmatter(
        post.content,
        blogPostFrontmatterSchema,
      );

      const publishedAt = new Date().toISOString();
      const updatedFrontmatter = {
        ...parsed.metadata,
        status: "published" as const,
        publishedAt,
      };

      const updatedContent = blogPostAdapter.createPostContent(
        updatedFrontmatter,
        parsed.content,
      );

      await context.entityService.updateEntity({
        ...post,
        content: updatedContent,
        metadata: {
          ...post.metadata,
          status: "published",
          publishedAt,
        },
      });

      await context.messaging.send("publish:report:success", {
        entityType,
        entityId,
        result: { id: entityId },
      });

      logger.info(`Published post: ${entityId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await context.messaging.send("publish:report:failure", {
        entityType,
        entityId,
        error: errorMessage,
      });
      logger.error(`Failed to publish post: ${errorMessage}`);
    }

    return { success: true };
  });

  logger.debug("Subscribed to publish:execute messages");
}
