import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { SocialPost } from "../schemas/social-post";
import { socialPostFrontmatterSchema } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";

/**
 * Input schema for social-media:edit tool
 */
export const editInputSchema = z.object({
  id: z.string().optional().describe("Social post ID to edit"),
  slug: z.string().optional().describe("Social post slug to edit"),
  content: z.string().optional().describe("New content for the post"),
  status: z
    .enum(["draft", "queued"])
    .optional()
    .describe("New status (only draft and queued allowed)"),
});

export type EditInput = z.infer<typeof editInputSchema>;

/**
 * Create the social-media:edit tool
 */
export function createEditTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_edit`,
    description: "Edit a draft or queued social media post",
    inputSchema: editInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { id, slug, content, status } = editInputSchema.parse(input);

        // Validate that at least one identifier is provided
        if (!id && !slug) {
          return {
            success: false,
            error: "Either 'id' or 'slug' must be provided",
            formatted: "_Error: Either 'id' or 'slug' must be provided_",
          };
        }

        // Validate that at least one edit is requested
        if (!content && !status) {
          return {
            success: false,
            error: "At least one of 'content' or 'status' must be provided",
            formatted: "_Error: Provide content or status to update_",
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

        // Validate post status - can only edit draft or queued posts
        if (post.metadata.status === "published") {
          return {
            success: false,
            error: "Cannot edit a published post",
            formatted: "_Cannot edit a published post_",
          };
        }

        // Parse current frontmatter
        const parsed = parseMarkdownWithFrontmatter(
          post.content,
          socialPostFrontmatterSchema,
        );

        // Build updated frontmatter
        const updatedFrontmatter = {
          ...parsed.metadata,
          ...(content !== undefined && { content }),
          ...(status !== undefined && { status }),
          retryCount: parsed.metadata.retryCount ?? 0,
        };

        // Regenerate content with updated frontmatter
        const updatedContent = socialPostAdapter.createPostContent(
          updatedFrontmatter,
          parsed.content,
        );

        // Regenerate slug if content changed
        const partial = socialPostAdapter.fromMarkdown(updatedContent);

        // Update entity
        const updatedPost: SocialPost = {
          ...post,
          content: updatedContent,
          metadata: {
            ...post.metadata,
            ...(partial.metadata?.slug && { slug: partial.metadata.slug }),
            ...(status !== undefined && { status }),
          },
        };
        await context.entityService.updateEntity(updatedPost);

        const preview =
          updatedFrontmatter.content.length > 50
            ? `${updatedFrontmatter.content.slice(0, 50)}...`
            : updatedFrontmatter.content;

        const formatted = formatAsEntity(
          {
            id: updatedPost.id,
            status: updatedPost.metadata.status,
            preview,
          },
          { title: "Social Post Updated" },
        );

        return {
          success: true,
          data: { post: updatedPost },
          message: "Social post updated successfully",
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
