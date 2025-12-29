import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z, formatAsEntity, formatAsList } from "@brains/utils";
import type { SocialPost } from "../schemas/social-post";
import { socialPostFrontmatterSchema } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";

/**
 * Input schema for social-media:queue tool
 */
export const queueInputSchema = z.object({
  action: z
    .enum(["add", "remove", "reorder", "list"])
    .describe("Queue action to perform"),
  postId: z
    .string()
    .optional()
    .describe("Post ID for add/remove/reorder actions"),
  slug: z
    .string()
    .optional()
    .describe("Post slug for add/remove/reorder actions"),
  position: z
    .number()
    .optional()
    .describe("New queue position for reorder action (1-based)"),
});

export type QueueInput = z.infer<typeof queueInputSchema>;

/**
 * Create the social-media:queue tool
 */
export function createQueueTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_queue`,
    description:
      "Manage the social post publish queue (add, remove, reorder, list)",
    inputSchema: queueInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { action, postId, slug, position } =
          queueInputSchema.parse(input);

        switch (action) {
          case "list":
            return await handleList(context);
          case "add":
            return await handleAdd(context, postId, slug);
          case "remove":
            return await handleRemove(context, postId, slug);
          case "reorder":
            return await handleReorder(context, postId, slug, position);
          default:
            return {
              success: false,
              error: `Unknown action: ${action}`,
              formatted: `_Error: Unknown action: ${action}_`,
            };
        }
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

/**
 * List all queued posts sorted by queue order
 */
async function handleList(
  context: ServicePluginContext,
): Promise<ToolResponse> {
  const posts = await context.entityService.listEntities<SocialPost>(
    "social-post",
    {
      filter: { metadata: { status: "queued" } },
      sortFields: [{ field: "queueOrder", direction: "asc" }],
      limit: 100,
    },
  );

  if (posts.length === 0) {
    return {
      success: true,
      data: { posts: [] },
      message: "No posts in queue",
      formatted: "_Queue is empty_",
    };
  }

  const items = posts.map((post, index) => {
    const parsed = parseMarkdownWithFrontmatter(
      post.content,
      socialPostFrontmatterSchema,
    );
    const preview =
      parsed.metadata.content.length > 50
        ? `${parsed.metadata.content.slice(0, 50)}...`
        : parsed.metadata.content;
    return {
      position: index + 1,
      id: post.id,
      platform: post.metadata.platform,
      preview,
    };
  });

  const formatted = formatAsList(items, {
    header: "**Publish Queue**",
    title: (item: { position: number; platform: string; preview: string }) =>
      `[${item.platform}] ${item.preview}`,
    numbered: true,
  });

  return {
    success: true,
    data: { posts: items },
    message: `${posts.length} posts in queue`,
    formatted,
  };
}

/**
 * Add a post to the queue (sets status to queued)
 */
async function handleAdd(
  context: ServicePluginContext,
  postId?: string,
  slug?: string,
): Promise<ToolResponse> {
  const post = await findPost(context, postId, slug);
  if (!post) {
    return notFoundResponse(postId, slug);
  }

  if (post.metadata.status === "queued") {
    return {
      success: false,
      error: "Post is already in queue",
      formatted: "_Post is already in queue_",
    };
  }

  if (post.metadata.status === "published") {
    return {
      success: false,
      error: "Cannot queue an already published post",
      formatted: "_Cannot queue an already published post_",
    };
  }

  // Get next queue position
  const queuedPosts = await context.entityService.listEntities<SocialPost>(
    "social-post",
    {
      filter: { metadata: { status: "queued" } },
      limit: 1000,
    },
  );
  const nextPosition = queuedPosts.length + 1;

  // Update post status to queued
  const parsed = parseMarkdownWithFrontmatter(
    post.content,
    socialPostFrontmatterSchema,
  );
  const updatedFrontmatter = {
    ...parsed.metadata,
    status: "queued" as const,
    queueOrder: nextPosition,
    retryCount: parsed.metadata.retryCount ?? 0,
  };
  const updatedContent = socialPostAdapter.createPostContent(
    updatedFrontmatter,
    parsed.content,
  );

  const updatedPost: SocialPost = {
    ...post,
    content: updatedContent,
    metadata: {
      ...post.metadata,
      status: "queued",
      queueOrder: nextPosition,
    },
  };
  await context.entityService.updateEntity(updatedPost);

  const formatted = formatAsEntity(
    {
      id: post.id,
      status: "queued",
      position: nextPosition,
    },
    { title: "Post Added to Queue" },
  );

  return {
    success: true,
    data: { post: updatedPost, position: nextPosition },
    message: `Post added to queue at position ${nextPosition}`,
    formatted,
  };
}

/**
 * Remove a post from the queue (sets status to draft)
 */
async function handleRemove(
  context: ServicePluginContext,
  postId?: string,
  slug?: string,
): Promise<ToolResponse> {
  const post = await findPost(context, postId, slug);
  if (!post) {
    return notFoundResponse(postId, slug);
  }

  if (post.metadata.status !== "queued") {
    return {
      success: false,
      error: "Post is not in queue",
      formatted: "_Post is not in queue_",
    };
  }

  // Update post status to draft
  const parsed = parseMarkdownWithFrontmatter(
    post.content,
    socialPostFrontmatterSchema,
  );
  const updatedFrontmatter = {
    ...parsed.metadata,
    status: "draft" as const,
    queueOrder: undefined,
    retryCount: parsed.metadata.retryCount ?? 0,
  };
  const updatedContent = socialPostAdapter.createPostContent(
    updatedFrontmatter,
    parsed.content,
  );

  const updatedPost: SocialPost = {
    ...post,
    content: updatedContent,
    metadata: {
      ...post.metadata,
      status: "draft",
      queueOrder: undefined,
    },
  };
  await context.entityService.updateEntity(updatedPost);

  const formatted = formatAsEntity(
    {
      id: post.id,
      status: "draft",
    },
    { title: "Post Removed from Queue" },
  );

  return {
    success: true,
    data: { post: updatedPost },
    message: "Post removed from queue",
    formatted,
  };
}

/**
 * Reorder a post in the queue
 */
async function handleReorder(
  context: ServicePluginContext,
  postId?: string,
  slug?: string,
  position?: number,
): Promise<ToolResponse> {
  if (position === undefined || position < 1) {
    return {
      success: false,
      error: "Position must be a positive number",
      formatted: "_Error: Position must be a positive number_",
    };
  }

  const post = await findPost(context, postId, slug);
  if (!post) {
    return notFoundResponse(postId, slug);
  }

  if (post.metadata.status !== "queued") {
    return {
      success: false,
      error: "Post is not in queue",
      formatted: "_Post is not in queue_",
    };
  }

  // Update post queue order
  const parsed = parseMarkdownWithFrontmatter(
    post.content,
    socialPostFrontmatterSchema,
  );
  const updatedFrontmatter = {
    ...parsed.metadata,
    queueOrder: position,
    retryCount: parsed.metadata.retryCount ?? 0,
  };
  const updatedContent = socialPostAdapter.createPostContent(
    updatedFrontmatter,
    parsed.content,
  );

  const updatedPost: SocialPost = {
    ...post,
    content: updatedContent,
    metadata: {
      ...post.metadata,
      queueOrder: position,
    },
  };
  await context.entityService.updateEntity(updatedPost);

  const formatted = formatAsEntity(
    {
      id: post.id,
      position,
    },
    { title: "Post Reordered" },
  );

  return {
    success: true,
    data: { post: updatedPost, position },
    message: `Post moved to position ${position}`,
    formatted,
  };
}

/**
 * Find a post by ID or slug
 */
async function findPost(
  context: ServicePluginContext,
  postId?: string,
  slug?: string,
): Promise<SocialPost | null> {
  if (postId) {
    return context.entityService.getEntity<SocialPost>("social-post", postId);
  }
  if (slug) {
    const posts = await context.entityService.listEntities<SocialPost>(
      "social-post",
      {
        filter: { metadata: { slug } },
        limit: 1,
      },
    );
    return posts[0] ?? null;
  }
  return null;
}

/**
 * Not found response helper
 */
function notFoundResponse(postId?: string, slug?: string): ToolResponse {
  const identifier = postId ?? slug ?? "unknown";
  return {
    success: false,
    error: `Post not found: ${identifier}`,
    formatted: `_Post not found: ${identifier}_`,
  };
}
