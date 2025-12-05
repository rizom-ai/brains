import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";

const getParamsSchema = z.object({
  id: z.string().describe("Blog post ID or slug"),
});

/**
 * Create get blog post tool
 */
export function createGetTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_get`,
    description: "Get a specific blog post by ID or slug",
    inputSchema: getParamsSchema.shape,
    visibility: "public",
    handler: async (input): Promise<ToolResponse> => {
      const { id } = getParamsSchema.parse(input);

      try {
        // Try direct ID lookup first
        let post = await context.entityService.getEntity<BlogPost>("post", id);

        // If not found, try by slug
        if (!post) {
          const allPosts = await context.entityService.listEntities<BlogPost>(
            "post",
            {
              limit: 100,
            },
          );
          post = allPosts.find((p) => p.metadata.slug === id) ?? null;
        }

        if (!post) {
          return {
            success: false,
            error: `Blog post not found: ${id}`,
            formatted: `_Blog post not found: ${id}_`,
          };
        }

        const formatted = formatAsEntity(
          {
            id: post.id,
            title: post.metadata.title,
            slug: post.metadata.slug,
            status: post.metadata.status,
            publishedAt: post.metadata.publishedAt,
            seriesName: post.metadata.seriesName,
          },
          { title: post.metadata.title ?? "Blog Post" },
        );

        return {
          success: true,
          data: {
            id: post.id,
            title: post.metadata.title,
            slug: post.metadata.slug,
            status: post.metadata.status,
            publishedAt: post.metadata.publishedAt,
            seriesName: post.metadata.seriesName,
            content: post.content,
          },
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error getting blog post: ${msg}_`,
        };
      }
    },
  };
}
