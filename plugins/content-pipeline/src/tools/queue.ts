import type { Tool, ToolContext, ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { QueueManager, QueueEntry } from "../queue-manager";
import type { PublicationQueueService } from "../publication-queue-service";

export type QueueMutationService = Pick<
  QueueManager,
  "add" | "remove" | "reorder"
>;

/**
 * Input schema for publish-pipeline:queue tool
 */
export type QueueAction = "list" | "add" | "remove" | "reorder";

export interface QueueInput {
  action: QueueAction;
  entityType?: string | undefined;
  entityId?: string | undefined;
  position?: number | undefined;
}

export const queueInputSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<QueueInput, QueueInput> = z.object({
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

/**
 * Queue item in list response
 */
export interface QueueItem {
  position: number;
  entityType: string;
  entityId: string;
  queuedAt: string;
}

export const queueItemSchema: z.ZodType<QueueItem, QueueItem> = z.object({
  position: z.number(),
  entityType: z.string(),
  entityId: z.string(),
  queuedAt: z.string(),
});

/**
 * Output schema for publish-pipeline:queue tool - discriminated union for success/error cases
 */
export interface QueueSuccessData {
  queue?: QueueItem[] | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  position?: number | undefined;
}

export interface QueueSuccessOutput {
  success: true;
  message?: string | undefined;
  data?: QueueSuccessData | undefined;
}

export interface QueueErrorOutput {
  success: false;
  error: string;
  code?: string | undefined;
}

export type QueueOutput = QueueSuccessOutput | QueueErrorOutput;

export const queueSuccessSchema: z.ZodType<
  QueueSuccessOutput,
  QueueSuccessOutput
> = z.object({
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

export const queueErrorSchema: z.ZodType<QueueErrorOutput, QueueErrorOutput> =
  z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
  });

export const queueOutputSchema: z.ZodType<QueueOutput, QueueOutput> = z.union([
  queueSuccessSchema,
  queueErrorSchema,
]);

/**
 * Create the publish-pipeline:queue tool
 *
 * This is a unified queue tool that manages publish queues for all entity types.
 */
export function createQueueTool(
  context: ServicePluginContext,
  pluginId: string,
  queueManager: QueueManager,
  publicationQueueService?: PublicationQueueService,
): Tool<QueueOutput> {
  const queueMutations: QueueMutationService =
    publicationQueueService ?? queueManager;

  return {
    name: `${pluginId}_queue`,
    description:
      "Manage the publish queue for all entity types (list, add, remove, reorder)",
    inputSchema: queueInputSchema.shape,
    outputSchema: queueOutputSchema,
    visibility: "admin",
    sideEffects: "writes",
    handler: async (rawInput, toolContext): Promise<QueueOutput> => {
      const parsed = queueInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(", ")}`,
        };
      }

      return handleQueueAction(
        context,
        queueManager,
        queueMutations,
        parsed.data,
        toolContext,
      );
    },
  };
}

export async function handleQueueAction(
  context: ServicePluginContext,
  queueManager: QueueManager,
  queueMutations: QueueMutationService,
  input: QueueInput,
  toolContext: ToolContext,
): Promise<QueueOutput> {
  const { action, entityType, entityId, position } = input;

  switch (action) {
    case "list":
      return handleList(queueManager, entityType);
    case "add":
      return handleAdd(
        context,
        queueMutations,
        entityType,
        entityId,
        toolContext,
      );
    case "remove":
      return handleRemove(
        context,
        queueMutations,
        entityType,
        entityId,
        toolContext,
      );
    case "reorder":
      return handleReorder(
        context,
        queueMutations,
        entityType,
        entityId,
        position,
        toolContext,
      );
  }
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
      data: { queue: emptyQueue() },
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
    success: true,
    data: { queue: items },
    message: `${queue.length} items in queue`,
  };
}

function emptyQueue(): QueueItem[] {
  return [];
}

/**
 * Add an entity to the queue
 */
async function handleAdd(
  context: ServicePluginContext,
  queueMutations: QueueMutationService,
  entityType?: string,
  entityId?: string,
  toolContext?: { userPermissionLevel?: ToolContext["userPermissionLevel"] },
): Promise<QueueOutput> {
  const target = requireQueueTarget("add", entityType, entityId);
  if (!target.success) return target.error;

  context.permissions.assertEntityActionAllowed(
    target.entityType,
    "publish",
    toolContext ?? {},
  );

  const result = await queueMutations.add(target.entityType, target.entityId, {
    ...toolContext,
    authorization: "user",
  });

  return {
    success: true,
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      position: result.position,
    },
    message: `Added to queue at position ${result.position}`,
  };
}

/**
 * Remove an entity from the queue
 */
async function handleRemove(
  context: ServicePluginContext,
  queueMutations: QueueMutationService,
  entityType?: string,
  entityId?: string,
  toolContext?: { userPermissionLevel?: ToolContext["userPermissionLevel"] },
): Promise<QueueOutput> {
  const target = requireQueueTarget("remove", entityType, entityId);
  if (!target.success) return target.error;

  context.permissions.assertEntityActionAllowed(
    target.entityType,
    "update",
    toolContext ?? {},
  );

  await queueMutations.remove(target.entityType, target.entityId);

  return {
    success: true,
    data: { entityType: target.entityType, entityId: target.entityId },
    message: "Removed from queue",
  };
}

/**
 * Reorder an entity in the queue
 */
async function handleReorder(
  context: ServicePluginContext,
  queueMutations: QueueMutationService,
  entityType?: string,
  entityId?: string,
  position?: number,
  toolContext?: { userPermissionLevel?: ToolContext["userPermissionLevel"] },
): Promise<QueueOutput> {
  const target = requireQueueTarget("reorder", entityType, entityId);
  if (!target.success) return target.error;

  const nextPosition = requirePosition(position);
  if (!nextPosition.success) return nextPosition.error;

  context.permissions.assertEntityActionAllowed(
    target.entityType,
    "update",
    toolContext ?? {},
  );

  await queueMutations.reorder(
    target.entityType,
    target.entityId,
    nextPosition.position,
  );

  return {
    success: true,
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      position: nextPosition.position,
    },
    message: `Moved to position ${nextPosition.position}`,
  };
}

type QueueTargetResult =
  | { success: true; entityType: string; entityId: string }
  | { success: false; error: QueueOutput };

function requireQueueTarget(
  action: "add" | "remove" | "reorder",
  entityType?: string,
  entityId?: string,
): QueueTargetResult {
  if (!entityType) {
    return {
      success: false,
      error: {
        success: false,
        error: `entityType is required for ${action} action`,
      },
    };
  }

  if (!entityId) {
    return {
      success: false,
      error: {
        success: false,
        error: `entityId is required for ${action} action`,
      },
    };
  }

  return { success: true, entityType, entityId };
}

type QueuePositionResult =
  { success: true; position: number } | { success: false; error: QueueOutput };

function requirePosition(position?: number): QueuePositionResult {
  if (position === undefined) {
    return {
      success: false,
      error: {
        success: false,
        error: "position is required for reorder action",
      },
    };
  }

  if (position < 1) {
    return {
      success: false,
      error: {
        success: false,
        error: "position must be a positive number",
      },
    };
  }

  return { success: true, position };
}
