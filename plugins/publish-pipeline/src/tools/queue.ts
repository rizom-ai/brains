import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z, formatAsList } from "@brains/utils";
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
 * Output schema for publish-pipeline:queue tool
 */
export const queueOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  formatted: z.string().optional(),
  data: z
    .object({
      queue: z.array(queueItemSchema).optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      position: z.number().optional(),
    })
    .optional(),
});

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
  const tool = createTool(
    pluginId,
    "queue",
    "Manage the publish queue for all entity types (list, add, remove, reorder)",
    queueInputSchema.shape,
    async (input: unknown): Promise<QueueOutput> => {
      try {
        const { action, entityType, entityId, position } =
          queueInputSchema.parse(input);

        switch (action) {
          case "list":
            return await handleList(queueManager, entityType);
          case "add":
            return await handleAdd(queueManager, entityType, entityId);
          case "remove":
            return await handleRemove(queueManager, entityType, entityId);
          case "reorder":
            return await handleReorder(
              queueManager,
              entityType,
              entityId,
              position,
            );
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
): Promise<QueueOutput> {
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
      success: true,
      data: { queue: [] },
      message: "No items in queue",
      formatted: "_Queue is empty_",
    };
  }

  const items = queue.map((entry, index) => ({
    position: index + 1,
    entityType: entry.entityType,
    entityId: entry.entityId,
    queuedAt: entry.queuedAt,
  }));

  const formatted = formatAsList(items, {
    header: "**Publish Queue**",
    title: (item: { position: number; entityType: string; entityId: string }) =>
      `[${item.entityType}] ${item.entityId}`,
    numbered: true,
  });

  return {
    success: true,
    data: { queue: items },
    message: `${queue.length} items in queue`,
    formatted,
  };
}

/**
 * Add an entity to the queue
 */
async function handleAdd(
  queueManager: QueueManager,
  entityType?: string,
  entityId?: string,
): Promise<QueueOutput> {
  if (!entityType) {
    return {
      success: false,
      error: "entityType is required for add action",
      formatted: "_Error: entityType is required for add action_",
    };
  }

  if (!entityId) {
    return {
      success: false,
      error: "entityId is required for add action",
      formatted: "_Error: entityId is required for add action_",
    };
  }

  const result = await queueManager.add(entityType, entityId);

  return {
    success: true,
    data: { entityType, entityId, position: result.position },
    message: `Added to queue at position ${result.position}`,
    formatted: `_Added ${entityType}:${entityId} to queue at position ${result.position}_`,
  };
}

/**
 * Remove an entity from the queue
 */
async function handleRemove(
  queueManager: QueueManager,
  entityType?: string,
  entityId?: string,
): Promise<QueueOutput> {
  if (!entityType) {
    return {
      success: false,
      error: "entityType is required for remove action",
      formatted: "_Error: entityType is required for remove action_",
    };
  }

  if (!entityId) {
    return {
      success: false,
      error: "entityId is required for remove action",
      formatted: "_Error: entityId is required for remove action_",
    };
  }

  await queueManager.remove(entityType, entityId);

  return {
    success: true,
    data: { entityType, entityId },
    message: "Removed from queue",
    formatted: `_Removed ${entityType}:${entityId} from queue_`,
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
): Promise<QueueOutput> {
  if (!entityType) {
    return {
      success: false,
      error: "entityType is required for reorder action",
      formatted: "_Error: entityType is required for reorder action_",
    };
  }

  if (!entityId) {
    return {
      success: false,
      error: "entityId is required for reorder action",
      formatted: "_Error: entityId is required for reorder action_",
    };
  }

  if (position === undefined) {
    return {
      success: false,
      error: "position is required for reorder action",
      formatted: "_Error: position is required for reorder action_",
    };
  }

  if (position < 1) {
    return {
      success: false,
      error: "position must be a positive number",
      formatted: "_Error: position must be a positive number_",
    };
  }

  await queueManager.reorder(entityType, entityId, position);

  return {
    success: true,
    data: { entityType, entityId, position },
    message: `Moved to position ${position}`,
    formatted: `_Moved ${entityType}:${entityId} to position ${position}_`,
  };
}
