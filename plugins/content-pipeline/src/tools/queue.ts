import type {
  PluginTool,
  ServicePluginContext,
  ToolResult,
} from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { QueueManager, QueueEntry } from "../queue-manager";

/**
 * Input schema for publish-pipeline:queue tool
 */
export const queueInputSchema = z.object({
  action: z
    .enum(["list", "add", "remove", "reorder"])
    .describe("Queue action to perform"),
  entityType: z
    .string()
    .optional()
    .describe(
      "Entity type (required for add/remove/reorder, optional for list)",
    ),
  entityId: z
    .string()
    .optional()
    .describe("Entity ID (required for add/remove/reorder)"),
  position: z
    .number()
    .optional()
    .describe("New position for reorder action (1-based)"),
});

export type QueueInput = z.infer<typeof queueInputSchema>;

/**
 * Queue item in list response
 */
export const queueItemSchema = z.object({
  position: z.number(),
  entityType: z.string(),
  entityId: z.string(),
  queuedAt: z.string(),
});

export type QueueItem = z.infer<typeof queueItemSchema>;

/**
 * Output schema for publish-pipeline:queue tool - discriminated union for success/error cases
 */
export const queueSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      queue: z.array(queueItemSchema).optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      position: z.number().optional(),
    })
    .optional(),
});

export const queueErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const queueOutputSchema = z.union([
  queueSuccessSchema,
  queueErrorSchema,
]);

export type QueueOutput = z.infer<typeof queueOutputSchema>;

/**
 * Create the publish-pipeline:queue tool
 *
 * This is a unified queue tool that manages publish queues for all entity types.
 */
export function createQueueTool(
  _context: ServicePluginContext,
  pluginId: string,
  queueManager: QueueManager,
): PluginTool<QueueOutput> {
  const tool = createTypedTool(
    pluginId,
    "queue",
    "Manage the publish queue for all entity types (list, add, remove, reorder)",
    queueInputSchema,
    async (input): Promise<ToolResult> => {
      const { action, entityType, entityId, position } = input;

      switch (action) {
        case "list":
          return handleList(queueManager, entityType);
        case "add":
          return handleAdd(queueManager, entityType, entityId);
        case "remove":
          return handleRemove(queueManager, entityType, entityId);
        case "reorder":
          return handleReorder(queueManager, entityType, entityId, position);
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
          };
      }
    },
  );

  return {
    ...tool,
    outputSchema: queueOutputSchema,
  } as PluginTool<QueueOutput>;
}

/**
 * List all queued items, optionally filtered by entityType
 */
async function handleList(
  queueManager: QueueManager,
  entityType?: string,
): Promise<ToolResult> {
  let queue: QueueEntry[] = [];

  if (entityType) {
    // Get queue for specific entity type
    queue = await queueManager.list(entityType);
  } else {
    // Get queues for all registered types
    const types = queueManager.getRegisteredTypes();
    for (const type of types) {
      const typeQueue = await queueManager.list(type);
      queue.push(...typeQueue);
    }
    // Sort by queuedAt (oldest first)
    queue.sort(
      (a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime(),
    );
  }

  if (queue.length === 0) {
    return {
      success: true as const,
      data: { queue: [] as QueueItem[] },
      message: "No items in queue",
    };
  }

  const items: QueueItem[] = queue.map((entry, index) => ({
    position: index + 1,
    entityType: entry.entityType,
    entityId: entry.entityId,
    queuedAt: entry.queuedAt,
  }));

  return {
    success: true as const,
    data: { queue: items },
    message: `${queue.length} items in queue`,
  };
}

/**
 * Add an entity to the queue
 */
async function handleAdd(
  queueManager: QueueManager,
  entityType?: string,
  entityId?: string,
): Promise<ToolResult> {
  if (!entityType) {
    return {
      success: false as const,
      error: "entityType is required for add action",
    };
  }

  if (!entityId) {
    return {
      success: false as const,
      error: "entityId is required for add action",
    };
  }

  const result = await queueManager.add(entityType, entityId);

  return {
    success: true as const,
    data: { entityType, entityId, position: result.position },
    message: `Added to queue at position ${result.position}`,
  };
}

/**
 * Remove an entity from the queue
 */
async function handleRemove(
  queueManager: QueueManager,
  entityType?: string,
  entityId?: string,
): Promise<ToolResult> {
  if (!entityType) {
    return {
      success: false as const,
      error: "entityType is required for remove action",
    };
  }

  if (!entityId) {
    return {
      success: false as const,
      error: "entityId is required for remove action",
    };
  }

  await queueManager.remove(entityType, entityId);

  return {
    success: true as const,
    data: { entityType, entityId },
    message: "Removed from queue",
  };
}

/**
 * Reorder an entity in the queue
 */
async function handleReorder(
  queueManager: QueueManager,
  entityType?: string,
  entityId?: string,
  position?: number,
): Promise<ToolResult> {
  if (!entityType) {
    return {
      success: false as const,
      error: "entityType is required for reorder action",
    };
  }

  if (!entityId) {
    return {
      success: false as const,
      error: "entityId is required for reorder action",
    };
  }

  if (position === undefined) {
    return {
      success: false as const,
      error: "position is required for reorder action",
    };
  }

  if (position < 1) {
    return {
      success: false as const,
      error: "position must be a positive number",
    };
  }

  await queueManager.reorder(entityType, entityId, position);

  return {
    success: true as const,
    data: { entityType, entityId, position },
    message: `Moved to position ${position}`,
  };
}
