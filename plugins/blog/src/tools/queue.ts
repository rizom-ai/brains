import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsEntity, formatAsList } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";

/**
 * Input schema for blog:queue tool
 */
export const queueInputSchema = z.object({
  action: z
    .enum(["remove", "reorder", "list"])
    .describe("Queue action to perform"),
  id: z.string().optional().describe("Post ID for remove/reorder actions"),
  slug: z.string().optional().describe("Post slug for remove/reorder actions"),
  position: z
    .number()
    .optional()
    .describe("New queue position for reorder action (1-based)"),
});

export type QueueInput = z.infer<typeof queueInputSchema>;

/**
 * Create the blog:queue tool
 */
export function createQueueTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_queue`,
    description: "Manage the blog post publish queue (list, remove, reorder)",
    inputSchema: queueInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { action, id, slug, position } = queueInputSchema.parse(input);

        switch (action) {
          case "list":
            return await handleList(context);
          case "remove":
            return await handleRemove(context, id, slug);
          case "reorder":
            return await handleReorder(context, id, slug, position);
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
 * List all queued posts via publish-pipeline
 */
async function handleList(
  context: ServicePluginContext,
): Promise<ToolResponse> {
  // Send list request to publish-pipeline
  await context.sendMessage("publish:list", { entityType: "post" });

  // Also query locally for immediate response
  const posts = await context.entityService.listEntities<BlogPost>("post", {
    filter: { metadata: { status: "queued" } },
    limit: 100,
  });

  if (posts.length === 0) {
    return {
      success: true,
      data: { posts: [] },
      message: "No posts in queue",
      formatted: "_Queue is empty_",
    };
  }

  const items = posts.map((post, index) => ({
    position: index + 1,
    id: post.id,
    title: post.metadata.title,
    slug: post.metadata.slug,
  }));

  const formatted = formatAsList(items, {
    header: "**Publish Queue**",
    title: (item: { position: number; title: string }) =>
      `${item.position}. ${item.title}`,
    numbered: false,
  });

  return {
    success: true,
    data: { posts: items },
    message: `${posts.length} posts in queue`,
    formatted,
  };
}

/**
 * Remove a post from the queue via publish-pipeline
 */
async function handleRemove(
  context: ServicePluginContext,
  id?: string,
  slug?: string,
): Promise<ToolResponse> {
  const post = await findPost(context, id, slug);
  if (!post) {
    return notFoundResponse(id, slug);
  }

  if (post.metadata.status !== "queued") {
    return {
      success: false,
      error: "Post is not in queue",
      formatted: "_Post is not in queue_",
    };
  }

  // Send remove message to publish-pipeline
  await context.sendMessage("publish:remove", {
    entityType: "post",
    entityId: post.id,
  });

  const formatted = formatAsEntity(
    {
      id: post.id,
      title: post.metadata.title,
      status: "draft",
    },
    { title: "Post Removed from Queue" },
  );

  return {
    success: true,
    data: { postId: post.id },
    message: "Post removed from queue",
    formatted,
  };
}

/**
 * Reorder a post in the queue via publish-pipeline
 */
async function handleReorder(
  context: ServicePluginContext,
  id?: string,
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

  const post = await findPost(context, id, slug);
  if (!post) {
    return notFoundResponse(id, slug);
  }

  if (post.metadata.status !== "queued") {
    return {
      success: false,
      error: "Post is not in queue",
      formatted: "_Post is not in queue_",
    };
  }

  // Send reorder message to publish-pipeline
  await context.sendMessage("publish:reorder", {
    entityType: "post",
    entityId: post.id,
    position,
  });

  const formatted = formatAsEntity(
    {
      id: post.id,
      title: post.metadata.title,
      position,
    },
    { title: "Post Reordered" },
  );

  return {
    success: true,
    data: { postId: post.id, position },
    message: `Post moved to position ${position}`,
    formatted,
  };
}

/**
 * Find a post by ID or slug
 */
async function findPost(
  context: ServicePluginContext,
  id?: string,
  slug?: string,
): Promise<BlogPost | null> {
  if (id) {
    return context.entityService.getEntity<BlogPost>("post", id);
  }
  if (slug) {
    const posts = await context.entityService.listEntities<BlogPost>("post", {
      filter: { metadata: { slug } },
      limit: 1,
    });
    return posts[0] ?? null;
  }
  return null;
}

/**
 * Not found response helper
 */
function notFoundResponse(id?: string, slug?: string): ToolResponse {
  const identifier = id ?? slug ?? "unknown";
  return {
    success: false,
    error: `Post not found: ${identifier}`,
    formatted: `_Post not found: ${identifier}_`,
  };
}
