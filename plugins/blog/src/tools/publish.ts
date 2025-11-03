import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";

/**
 * Input schema for blog:publish tool
 */
export const publishInputSchema = z.object({
  id: z.string().describe("Blog post ID"),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * Create the blog:publish tool
 */
export function createPublishTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}:publish`,
    description:
      "Publish a blog post (sets publishedAt and triggers site rebuild)",
    inputSchema: publishInputSchema.shape,
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { id } = publishInputSchema.parse(input);

        // Get blog post entity
        const post = await context.entityService.getEntity("blog", id);
        if (!post || !post.metadata) {
          return {
            success: false,
            error: `Blog post not found: ${id}`,
          };
        }

        // Set publishedAt to current timestamp
        const updatedPost = {
          ...post,
          metadata: {
            ...(post.metadata as Record<string, unknown>),
            publishedAt: new Date().toISOString(),
          },
        };
        const result = await context.entityService.updateEntity(updatedPost);

        // Trigger production site rebuild
        await context.enqueueJob("site-build", {
          environment: "production",
          metadata: {
            trigger: "blog:publish",
            blogPostId: id,
            timestamp: new Date().toISOString(),
          },
        });

        return {
          success: true,
          data: { ...result, post: updatedPost },
          message: `Blog post published successfully`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
