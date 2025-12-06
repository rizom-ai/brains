import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsEntity, parseMarkdown } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";

const getParamsSchema = z.object({
  id: z.string().describe("Blog post title, ID, or slug"),
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
    description:
      "Read a blog post. Use this when users want to read, view, or see a blog post. Accepts title, ID, or slug.",
    inputSchema: getParamsSchema.shape,
    visibility: "public",
    handler: async (input): Promise<ToolResponse> => {
      const { id } = getParamsSchema.parse(input);

      try {
        // Try direct ID lookup first
        let post = await context.entityService.getEntity<BlogPost>("post", id);

        // If not found, try by slug using proper filter
        if (!post) {
          const bySlug = await context.entityService.listEntities<BlogPost>(
            "post",
            { limit: 1, filter: { metadata: { slug: id } } },
          );
          post = bySlug[0] ?? null;
        }

        // If still not found, try by title (case-sensitive for now)
        if (!post) {
          const byTitle = await context.entityService.listEntities<BlogPost>(
            "post",
            { limit: 1, filter: { metadata: { title: id } } },
          );
          post = byTitle[0] ?? null;
        }

        if (!post) {
          return {
            success: false,
            error: `Blog post not found: ${id}`,
            formatted: `_Blog post not found: ${id}_`,
          };
        }

        // Parse the markdown to separate frontmatter and body
        const { frontmatter, content: body } = parseMarkdown(post.content);

        // Format frontmatter nicely, then append body
        const frontmatterFormatted = formatAsEntity(frontmatter, {
          title: post.metadata.title ?? "Blog Post",
          excludeFields: ["title"], // Already in header
        });

        const formatted = `${frontmatterFormatted}\n\n---\n\n${body}`;

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
