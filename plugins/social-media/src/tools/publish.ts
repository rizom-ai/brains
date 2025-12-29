import type {
  PluginTool,
  ToolResponse,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { SocialPost } from "../schemas/social-post";

/**
 * Input schema for social-media:publish tool
 */
export const publishInputSchema = z.object({
  id: z.string().optional().describe("Social post ID to publish"),
  slug: z.string().optional().describe("Social post slug to publish"),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * Create the social-media:publish tool
 */
export function createPublishTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_publish`,
    description:
      "Publish a social media post to the platform (enqueues publish job)",
    inputSchema: publishInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        const { id, slug } = publishInputSchema.parse(input);

        // Validate that at least one identifier is provided
        if (!id && !slug) {
          return {
            success: false,
            error: "Either 'id' or 'slug' must be provided",
            formatted: "_Error: Either 'id' or 'slug' must be provided_",
          };
        }

        // Find the post
        let post: SocialPost | null = null;
        if (id) {
          post = await context.entityService.getEntity<SocialPost>(
            "social-post",
            id,
          );
        } else if (slug) {
          const posts = await context.entityService.listEntities<SocialPost>(
            "social-post",
            {
              filter: { metadata: { slug } },
              limit: 1,
            },
          );
          post = posts[0] ?? null;
        }

        if (!post) {
          const identifier = id ?? slug;
          return {
            success: false,
            error: `Social post not found: ${identifier}`,
            formatted: `_Social post not found: ${identifier}_`,
          };
        }

        // Validate post status
        if (post.metadata.status === "published") {
          return {
            success: false,
            error: "Post is already published",
            formatted: "_Post is already published_",
          };
        }

        // Enqueue publish job
        const jobId = await context.enqueueJob(
          "publish",
          { postId: post.id },
          toolContext,
          {
            source: `${pluginId}_publish`,
            metadata: {
              operationType: "content_operations",
              operationTarget: "social-post",
            },
          },
        );

        const formatted = formatAsEntity(
          {
            jobId,
            postId: post.id,
            platform: post.metadata.platform,
            status: "publishing",
          },
          { title: "Social Post Publish" },
        );

        return {
          success: true,
          data: { jobId, postId: post.id },
          message: `Publish job queued (jobId: ${jobId})`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}
