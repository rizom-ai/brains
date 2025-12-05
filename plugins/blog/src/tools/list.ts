import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsList } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";

const listParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  status: z.enum(["draft", "published", "all"]).default("all"),
});

/**
 * Create list blog posts tool
 */
export function createListTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_list`,
    description: "List blog posts with optional status filter",
    inputSchema: listParamsSchema.shape,
    visibility: "public",
    handler: async (input): Promise<ToolResponse> => {
      const { limit, status } = listParamsSchema.parse(input);

      try {
        // Get all posts
        const allPosts = await context.entityService.listEntities<BlogPost>(
          "post",
          {
            limit: status === "all" ? limit : 100, // Get more if filtering
          },
        );

        // Filter by status if needed
        const posts =
          status === "all"
            ? allPosts.slice(0, limit)
            : allPosts
                .filter((p) => p.metadata.status === status)
                .slice(0, limit);

        const statusLabel =
          status === "all"
            ? ""
            : ` ${status.charAt(0).toUpperCase() + status.slice(1)}`;
        const formatted = formatAsList(posts, {
          title: (p) => p.metadata.title ?? p.id,
          subtitle: (p) => {
            const postStatus = p.metadata.status ?? "draft";
            const date = p.metadata.publishedAt;
            return `${postStatus} • ${date ?? "no date"}`;
          },
          header: `##${statusLabel} Posts (${posts.length})`,
        });

        return {
          success: true,
          data: {
            posts: posts.map((p) => ({
              id: p.id,
              title: p.metadata.title,
              slug: p.metadata.slug,
              status: p.metadata.status,
              publishedAt: p.metadata.publishedAt,
              seriesName: p.metadata.seriesName,
            })),
            count: posts.length,
          },
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error listing blog posts: ${msg}_`,
        };
      }
    },
  };
}
