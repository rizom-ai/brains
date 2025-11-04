import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import { blogPostAdapter } from "../adapters/blog-post-adapter";

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
        const post = await context.entityService.getEntity<BlogPost>(
          "post",
          id,
        );
        if (!post?.content) {
          return {
            success: false,
            error: `Blog post not found: ${id}`,
          };
        }

        // Parse frontmatter from content
        const parsed = parseMarkdownWithFrontmatter(
          post.content,
          blogPostFrontmatterSchema,
        );

        // Update frontmatter with published status and timestamp
        const publishedAt = new Date().toISOString();
        const updatedFrontmatter = {
          ...parsed.metadata,
          status: "published" as const,
          publishedAt,
        };

        // Regenerate content with updated frontmatter
        const updatedContent = blogPostAdapter.createPostContent(
          updatedFrontmatter,
          parsed.content,
        );

        // Update entity with new content and synced metadata
        const updatedPost: BlogPost = {
          ...post,
          content: updatedContent,
          metadata: {
            title: updatedFrontmatter.title,
            status: updatedFrontmatter.status,
            publishedAt: updatedFrontmatter.publishedAt,
            seriesName: updatedFrontmatter.seriesName,
            seriesIndex: updatedFrontmatter.seriesIndex,
          },
        };
        const result = await context.entityService.updateEntity(updatedPost);

        // Entity update will automatically trigger entity:updated message
        // which site-builder subscribes to for rebuilding

        return {
          success: true,
          data: { ...result, post: updatedPost },
          message: `Blog post "${updatedFrontmatter.title}" published successfully`,
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
