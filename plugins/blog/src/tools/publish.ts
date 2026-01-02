import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import { blogPostAdapter } from "../adapters/blog-post-adapter";

/**
 * Input schema for blog:publish tool
 */
export const publishInputSchema = z.object({
  id: z.string().optional().describe("Blog post ID"),
  slug: z.string().optional().describe("Blog post slug"),
  direct: z
    .boolean()
    .optional()
    .default(true)
    .describe("Publish immediately (true) or add to queue (false)"),
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
    name: `${pluginId}_publish`,
    description:
      "Publish a blog post immediately (direct=true) or add to queue for scheduled publishing (direct=false)",
    inputSchema: publishInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { id, slug, direct } = publishInputSchema.parse(input);

        // Validate that at least one identifier is provided
        if (!id && !slug) {
          return {
            success: false,
            error: "Either 'id' or 'slug' must be provided",
            formatted: "_Error: Either 'id' or 'slug' must be provided_",
          };
        }

        // Get blog post entity by ID or slug
        let post: BlogPost | null = null;

        if (id) {
          // Try to get by ID first
          post = await context.entityService.getEntity<BlogPost>("post", id);
        } else if (slug) {
          // Search by slug in metadata
          const posts = await context.entityService.listEntities<BlogPost>(
            "post",
            {
              filter: { metadata: { slug } },
              limit: 1,
            },
          );
          post = posts[0] ?? null;
        }

        if (!post?.content) {
          const identifier = id ?? slug;
          return {
            success: false,
            error: `Blog post not found: ${identifier}`,
            formatted: `_Blog post not found: ${identifier}_`,
          };
        }

        // Parse frontmatter from content
        const parsed = parseMarkdownWithFrontmatter(
          post.content,
          blogPostFrontmatterSchema,
        );

        // Handle queue mode (direct=false)
        if (!direct) {
          // Cannot queue already published posts
          if (post.metadata.status === "published") {
            return {
              success: false,
              error: "Post is already published",
              formatted: "_Post is already published_",
            };
          }

          // Update status to queued
          const updatedFrontmatter = {
            ...parsed.metadata,
            status: "queued" as const,
          };

          const updatedContent = blogPostAdapter.createPostContent(
            updatedFrontmatter,
            parsed.content,
          );

          const updatedPost: BlogPost = {
            ...post,
            content: updatedContent,
            metadata: {
              ...post.metadata,
              status: "queued",
            },
          };
          await context.entityService.updateEntity(updatedPost);

          // Send queue message to publish-pipeline
          await context.sendMessage("publish:queue", {
            entityType: "post",
            entityId: post.id,
          });

          const formatted = formatAsEntity(
            {
              id: post.id,
              title: parsed.metadata.title,
              status: "queued",
            },
            { title: "Blog Post Queued" },
          );

          return {
            success: true,
            data: { postId: post.id },
            message: `Blog post "${parsed.metadata.title}" added to queue`,
            formatted,
          };
        }

        // Direct publish mode (default)
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
            slug: updatedFrontmatter.slug ?? post.metadata.slug,
            status: updatedFrontmatter.status,
            publishedAt: updatedFrontmatter.publishedAt,
            seriesName: updatedFrontmatter.seriesName,
            seriesIndex: updatedFrontmatter.seriesIndex,
          },
        };
        const result = await context.entityService.updateEntity(updatedPost);

        const formatted = formatAsEntity(
          {
            id: updatedPost.id,
            title: updatedFrontmatter.title,
            slug: updatedPost.metadata.slug,
            status: "published",
            publishedAt,
          },
          { title: "Blog Post Published" },
        );

        return {
          success: true,
          data: { ...result, post: updatedPost },
          message: `Blog post "${updatedFrontmatter.title}" published successfully`,
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
