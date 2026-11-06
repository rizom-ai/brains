import {
  findEntityByIdentifier,
  permissionToVisibilityScope,
  type ServicePluginContext,
  type ToolContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { QueueManager, QueueEntry } from "../queue-manager";

export type QueueMutationService = Pick<
  QueueManager,
  "add" | "remove" | "reorder"
>;

type QueueListActionSchema = z.ZodObject<{
  action: z.ZodLiteral<"queue-list">;
  entityType: z.ZodOptional<z.ZodString>;
}>;

type QueueTargetActionSchema<Action extends string> = z.ZodObject<{
  action: z.ZodLiteral<Action>;
  entityType: z.ZodString;
  entityId: z.ZodString;
}>;

type QueueReorderActionSchema = z.ZodObject<{
  action: z.ZodLiteral<"queue-reorder">;
  entityType: z.ZodString;
  entityId: z.ZodString;
  position: z.ZodNumber;
}>;

type QueueActionSchema = z.ZodDiscriminatedUnion<
  [
    QueueListActionSchema,
    QueueTargetActionSchema<"queue-add">,
    QueueTargetActionSchema<"queue-remove">,
    QueueReorderActionSchema,
  ]
>;

/**
 * Validated queue actions of the publishing_manage tool. Every target action
 * names its entity, and a reorder position is a positive integer.
 */
export const queueActionSchema: QueueActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({
      action: z.literal("queue-list"),
      entityType: z.string().optional(),
    }),
    z.object({
      action: z.literal("queue-add"),
      entityType: z.string().min(1),
      entityId: z.string().min(1),
    }),
    z.object({
      action: z.literal("queue-remove"),
      entityType: z.string().min(1),
      entityId: z.string().min(1),
    }),
    z.object({
      action: z.literal("queue-reorder"),
      entityType: z.string().min(1),
      entityId: z.string().min(1),
      position: z.number().int().positive(),
    }),
  ],
);

export type QueueActionInput = z.output<typeof queueActionSchema>;
type QueueTargetInput = Exclude<QueueActionInput, { action: "queue-list" }>;

/**
 * Queue item in list response
 */
export const queueItemSchema: z.ZodObject<{
  position: z.ZodNumber;
  entityType: z.ZodString;
  entityId: z.ZodString;
  queuedAt: z.ZodString;
}> = z.object({
  position: z.number(),
  entityType: z.string(),
  entityId: z.string(),
  queuedAt: z.string(),
});

export type QueueItem = z.output<typeof queueItemSchema>;

/**
 * Output schema for the publishing_manage queue actions - discriminated union for success/error cases
 */
type QueueSuccessSchema = z.ZodObject<{
  success: z.ZodLiteral<true>;
  message: z.ZodOptional<z.ZodString>;
  data: z.ZodOptional<
    z.ZodObject<{
      queue: z.ZodOptional<z.ZodArray<typeof queueItemSchema>>;
      entityType: z.ZodOptional<z.ZodString>;
      entityId: z.ZodOptional<z.ZodString>;
      position: z.ZodOptional<z.ZodNumber>;
    }>
  >;
}>;

export const queueSuccessSchema: QueueSuccessSchema = z.object({
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

type QueueErrorSchema = z.ZodObject<{
  success: z.ZodLiteral<false>;
  error: z.ZodString;
  code: z.ZodOptional<z.ZodString>;
}>;

export const queueErrorSchema: QueueErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const queueOutputSchema: z.ZodUnion<
  [QueueSuccessSchema, QueueErrorSchema]
> = z.union([queueSuccessSchema, queueErrorSchema]);

export type QueueSuccessOutput = z.output<typeof queueSuccessSchema>;
export type QueueSuccessData = NonNullable<QueueSuccessOutput["data"]>;
export type QueueErrorOutput = z.output<typeof queueErrorSchema>;
export type QueueOutput = z.output<typeof queueOutputSchema>;

export async function handleQueueAction(
  context: ServicePluginContext,
  queueManager: QueueManager,
  queueMutations: QueueMutationService,
  input: QueueActionInput,
  toolContext: ToolContext,
): Promise<QueueOutput> {
  if (input.action === "queue-list") {
    return handleList(queueManager, input.entityType);
  }

  const target: QueueTargetInput = {
    ...input,
    entityId: await canonicalEntityId(
      context,
      input.entityType,
      input.entityId,
      toolContext,
    ),
  };

  switch (target.action) {
    case "queue-add":
      return handleAdd(context, queueMutations, target, toolContext);
    case "queue-remove":
      return handleRemove(context, queueMutations, target, toolContext);
    case "queue-reorder":
      return handleReorder(context, queueMutations, target, toolContext);
  }
}

/**
 * A title or slug names the same entity as its id, as in the system tools.
 * An identifier that matches nothing passes through unchanged, so a queue
 * entry whose entity is gone stays removable.
 */
async function canonicalEntityId(
  context: ServicePluginContext,
  entityType: string,
  identifier: string,
  toolContext: ToolContext,
): Promise<string> {
  const entity = await findEntityByIdentifier(
    context.entityService,
    entityType,
    identifier,
    undefined,
    permissionToVisibilityScope(toolContext.userPermissionLevel),
  );
  return entity?.id ?? identifier;
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
  target: Extract<QueueTargetInput, { action: "queue-add" }>,
  toolContext: ToolContext,
): Promise<QueueOutput> {
  context.permissions.assertEntityActionAllowed(
    target.entityType,
    "publish",
    toolContext,
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
  target: Extract<QueueTargetInput, { action: "queue-remove" }>,
  toolContext: ToolContext,
): Promise<QueueOutput> {
  context.permissions.assertEntityActionAllowed(
    target.entityType,
    "update",
    toolContext,
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
  target: Extract<QueueTargetInput, { action: "queue-reorder" }>,
  toolContext: ToolContext,
): Promise<QueueOutput> {
  context.permissions.assertEntityActionAllowed(
    target.entityType,
    "update",
    toolContext,
  );

  await queueMutations.reorder(
    target.entityType,
    target.entityId,
    target.position,
  );

  return {
    success: true,
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      position: target.position,
    },
    message: `Moved to position ${target.position}`,
  };
}
