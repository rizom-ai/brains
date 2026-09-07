import {
  defineStudioWorkspace,
  defineEntityCatalog,
  defineWorkspaceAction,
  permissionToVisibilityScope,
  registerBuiltInStudioWorkspace,
  type OperatorCaller,
  type OperatorRegionBlock,
  type OperatorViewBlock,
  type ServicePluginContext,
  type ToolContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "../provider-registry";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";
import type { PublicationQueueService } from "../publication-queue-service";
import type { PublishEntityExecutor } from "../publish-executor";
import {
  getPublicationPipelineSnapshot,
  hasPublicationStatus,
  publicationPipelineSnapshotSchema,
} from "../pipeline-snapshot";
import { publishOutputSchema } from "../tools/publish";

type PublishingTargetSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
}>;

const publishingTargetSchema: PublishingTargetSchema = z.object({
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().trim().min(1).max(500),
});

type StudioPublishConfirmationSchema = z.ZodObject<{
  confirmed: z.ZodLiteral<true>;
  confirmationToken: z.ZodString;
  contentHash: z.ZodString;
  expiresAt: z.ZodString;
}>;

const studioPublishConfirmationSchema: StudioPublishConfirmationSchema =
  z.object({
    confirmed: z.literal(true),
    confirmationToken: z.string().min(1),
    contentHash: z.string().min(1),
    expiresAt: z.string().datetime(),
  });

export type StudioPublishConfirmation = z.output<
  typeof studioPublishConfirmationSchema
>;

type StudioPublishingTarget = z.output<typeof publishingTargetSchema>;

const reorderInputSchema: ReturnType<
  typeof publishingTargetSchema.extend<{ position: z.ZodNumber }>
> = publishingTargetSchema.extend({
  position: z.number().int().positive(),
});
const successSchema = z.object({ success: z.literal(true) });

const queueAction = defineWorkspaceAction({
  name: "queue",
  label: "Add to queue",
  permission: "trusted",
  input: publishingTargetSchema,
  output: successSchema,
});
const removeAction = defineWorkspaceAction({
  name: "remove",
  label: "Remove from queue",
  permission: "trusted",
  input: publishingTargetSchema,
  output: successSchema,
});
const retryAction = defineWorkspaceAction({
  name: "retry",
  label: "Retry publication",
  permission: "trusted",
  input: publishingTargetSchema,
  output: successSchema,
});
const reorderAction = defineWorkspaceAction({
  name: "reorder",
  label: "Reorder",
  permission: "trusted",
  input: reorderInputSchema,
  output: successSchema,
});
const publishAction = defineWorkspaceAction({
  name: "publish",
  label: "Publish now",
  permission: "trusted",
  confirmation: { kind: "prepared" },
  input: publishingTargetSchema,
  output: publishOutputSchema,
});

const publishableEntities = defineEntityCatalog({
  id: "publishable-entities",
  label: "Publishable entities",
});

type TargetAction<TType extends string> = ReturnType<
  typeof publishingTargetSchema.extend<{ type: z.ZodLiteral<TType> }>
>;

type StudioPublishingActionSchema = z.ZodDiscriminatedUnion<
  [
    TargetAction<"queue">,
    TargetAction<"remove">,
    TargetAction<"retry">,
    ReturnType<
      typeof reorderInputSchema.extend<{ type: z.ZodLiteral<"reorder"> }>
    >,
    ReturnType<
      typeof publishingTargetSchema.extend<{
        type: z.ZodLiteral<"publish">;
        confirmation: z.ZodOptional<StudioPublishConfirmationSchema>;
      }>
    >,
  ]
>;

export const studioPublishingActionSchema: StudioPublishingActionSchema =
  z.discriminatedUnion("type", [
    publishingTargetSchema.extend({ type: z.literal("queue") }),
    publishingTargetSchema.extend({ type: z.literal("remove") }),
    publishingTargetSchema.extend({ type: z.literal("retry") }),
    reorderInputSchema.extend({ type: z.literal("reorder") }),
    publishingTargetSchema.extend({
      type: z.literal("publish"),
      confirmation: studioPublishConfirmationSchema.optional(),
    }),
  ]);

export type StudioPublishingAction = z.output<
  typeof studioPublishingActionSchema
>;

export interface RegisterStudioWorkspaceDeps {
  providerRegistry: ProviderRegistry;
  queueManager: QueueManager;
  publicationQueueService: PublicationQueueService;
  retryTracker: RetryTracker;
  publishExecutor: PublishEntityExecutor;
}

function toToolContext(caller: OperatorCaller): ToolContext {
  return {
    interfaceType: "studio",
    actor: { kind: "user", userId: caller.actor.id },
    userPermissionLevel: caller.permission,
  };
}

function getWorkspaceEntityTypes(
  context: ServicePluginContext,
  providerRegistry: ProviderRegistry,
  caller: OperatorCaller,
): string[] {
  const toolContext = toToolContext(caller);
  return providerRegistry.getRegisteredTypes().filter((entityType) => {
    const workspaceActions: Array<"update" | "publish"> = ["update", "publish"];
    for (const action of workspaceActions) {
      try {
        context.permissions.assertEntityActionAllowed(
          entityType,
          action,
          toolContext,
        );
        return true;
      } catch {
        // Try the other workspace capability.
      }
    }
    return false;
  });
}

async function requirePublicationEntity(
  context: ServicePluginContext,
  deps: RegisterStudioWorkspaceDeps,
  input: StudioPublishingTarget,
  caller: OperatorCaller,
): Promise<{ metadata: Record<string, unknown> }> {
  if (!deps.providerRegistry.has(input.entityType)) {
    throw new Error(`No publish provider registered for ${input.entityType}`);
  }
  const entity = await context.entityService.getEntity({
    entityType: input.entityType,
    id: input.entityId,
    visibilityScope: permissionToVisibilityScope(caller.permission),
  });
  if (!entity) {
    throw new Error(`Entity not found: ${input.entityType}:${input.entityId}`);
  }
  return entity;
}

async function mutateQueue(
  context: ServicePluginContext,
  deps: RegisterStudioWorkspaceDeps,
  action: "queue" | "remove" | "retry" | "reorder",
  input: StudioPublishingTarget & { position?: number | undefined },
  caller: OperatorCaller,
): Promise<{ success: true }> {
  const entity = await requirePublicationEntity(context, deps, input, caller);
  const toolContext = toToolContext(caller);
  const permissionAction =
    action === "queue" || action === "retry" ? "publish" : "update";
  context.permissions.assertEntityActionAllowed(
    input.entityType,
    permissionAction,
    toolContext,
  );
  const status = entity.metadata["status"];
  if (action === "queue") {
    if (status !== "draft")
      throw new Error("Only draft entities can be queued");
    await deps.publicationQueueService.enqueue(
      input.entityType,
      input.entityId,
      { ...toolContext, authorization: "user" },
    );
    return { success: true };
  }
  if (action === "remove") {
    if (status !== "queued") {
      throw new Error("Only queued entities can be removed from the queue");
    }
    await deps.publicationQueueService.remove(input.entityType, input.entityId);
    return { success: true };
  }
  if (action === "retry") {
    if (status !== "failed") {
      throw new Error("Only failed publications can be retried");
    }
    await deps.publicationQueueService.enqueue(
      input.entityType,
      input.entityId,
      { ...toolContext, authorization: "user" },
    );
    return { success: true };
  }
  if (status !== "queued" || input.position === undefined) {
    throw new Error("Only queued entities can be reordered");
  }
  await deps.publicationQueueService.reorder(
    input.entityType,
    input.entityId,
    await toAbsoluteQueuePosition(
      context,
      deps.queueManager,
      input.entityType,
      caller,
      input.position,
    ),
  );
  return { success: true };
}

async function preparePublish(
  context: ServicePluginContext,
  deps: RegisterStudioWorkspaceDeps,
  input: StudioPublishingTarget,
  caller: OperatorCaller,
): Promise<{ summary: string; revision: string }> {
  await requirePublicationEntity(context, deps, input, caller);
  context.permissions.assertEntityActionAllowed(
    input.entityType,
    "publish",
    toToolContext(caller),
  );
  const candidate = await deps.publishExecutor.resolveCandidate({
    entityType: input.entityType,
    id: input.entityId,
  });
  if ("error" in candidate) throw new Error(candidate.error);
  const label =
    typeof candidate.entity.metadata["title"] === "string"
      ? candidate.entity.metadata["title"]
      : candidate.entity.id;
  return {
    summary: `Publish "${label}" to its registered public provider?`,
    revision: candidate.entity.contentHash,
  };
}

async function publishNow(
  context: ServicePluginContext,
  deps: RegisterStudioWorkspaceDeps,
  input: StudioPublishingTarget,
  caller: OperatorCaller,
): Promise<z.output<typeof publishOutputSchema>> {
  await preparePublish(context, deps, input, caller);
  const result = await deps.publishExecutor.publish({
    entityType: input.entityType,
    id: input.entityId,
  });
  if ("error" in result) return { success: false, error: result.error };
  await deps.publicationQueueService.complete(input.entityType, input.entityId);
  deps.retryTracker.clearRetries(input.entityId);
  return {
    success: true,
    message: `Published ${input.entityType}:${result.entity.id}`,
    data: {
      entityType: input.entityType,
      entityId: result.entity.id,
      platformId: result.result.id,
      ...(result.result.url ? { url: result.result.url } : {}),
    },
  };
}

interface PublishingTargetLink {
  readonly catalog: typeof publishableEntities;
  readonly entityType: string;
  readonly id: string;
}

function targetLink(
  entityType: string,
  entityId: string,
): PublishingTargetLink {
  return { catalog: publishableEntities, entityType, id: entityId };
}

const publishingWorkspace = defineStudioWorkspace({
  id: "publishing",
  label: "Publishing",
  priority: 40,
  permission: "trusted",
  entityCatalog: publishableEntities,
  data: publicationPipelineSnapshotSchema,
  actions: [
    queueAction,
    removeAction,
    retryAction,
    reorderAction,
    publishAction,
  ],
  view: ({ data }) => {
    type PublishingBlock = OperatorViewBlock<
      | typeof queueAction
      | typeof removeAction
      | typeof retryAction
      | typeof reorderAction
      | typeof publishAction
    >;
    type PublishingRegion = OperatorRegionBlock<
      | typeof queueAction
      | typeof removeAction
      | typeof retryAction
      | typeof reorderAction
      | typeof publishAction
    >;
    const totals: PublishingBlock = {
      type: "key-values",
      id: "publishing-summary",
      items: [{ label: "Published", value: data.summary.published }],
    };
    const atRest =
      data.queue.length === 0 &&
      data.generating.length === 0 &&
      data.failures.length === 0;
    // One rest state reads as a desk with nothing on it; three separate empty
    // collections read as three broken panels.
    const work: PublishingRegion[] = atRest
      ? [
          {
            type: "notice",
            id: "publishing-at-rest",
            title: "Nothing is in flight",
            text: "Queue a draft to start a publication run.",
          },
        ]
      : [
          {
            type: "list",
            id: "dispatch-queue",
            empty: "Nothing is queued for publication.",
            items: data.queue.map((item) => {
              const destinationCount = data.queue.filter(
                (candidate) => candidate.entityType === item.entityType,
              ).length;
              return {
                id: `queue-${item.entityType}-${item.position}`,
                title: item.title,
                metadata: [
                  item.destination,
                  item.scheduledFor ?? "Next dispatch",
                ],
                count: item.position,
                link: targetLink(item.entityType, item.entityId),
                actions: [
                  {
                    action: reorderAction,
                    label: "Move up",
                    input: {
                      entityType: item.entityType,
                      entityId: item.entityId,
                      position: Math.max(1, item.position - 1),
                    },
                    disabled: item.position <= 1,
                  },
                  {
                    action: reorderAction,
                    label: "Move down",
                    input: {
                      entityType: item.entityType,
                      entityId: item.entityId,
                      position: item.position + 1,
                    },
                    disabled: item.position >= destinationCount,
                  },
                  {
                    action: removeAction,
                    input: {
                      entityType: item.entityType,
                      entityId: item.entityId,
                    },
                  },
                ],
              };
            }),
          },
          {
            type: "list",
            id: "generating",
            empty: "No publication assets are being generated.",
            items: data.generating.map((job, index) => {
              const [entityType, ...entityId] = job.target.split("/");
              return {
                id: `generating-${index + 1}`,
                title: job.label,
                metadata: [job.target, job.status],
                badges: [{ label: job.status }],
                ...(entityType && entityId.length > 0
                  ? { link: targetLink(entityType, entityId.join("/")) }
                  : {}),
              };
            }),
          },
          {
            type: "list",
            id: "publication-failures",
            empty: "No failed publications.",
            items: data.failures.map((failure, index) => ({
              id: `failure-${index + 1}`,
              title: failure.title,
              description: failure.error,
              metadata: [`Retries: ${failure.retryCount}`],
              tone: "error",
              link: targetLink(failure.entityType, failure.entityId),
              actions: [
                {
                  action: retryAction,
                  input: {
                    entityType: failure.entityType,
                    entityId: failure.entityId,
                  },
                },
              ],
            })),
          },
        ];
    const failures = work.filter(
      (block): block is Extract<PublishingRegion, { type: "list" }> =>
        block.type === "list" &&
        block.id === "publication-failures" &&
        block.items.length > 0,
    );
    const blocks: PublishingBlock[] = [
      ...failures.map((block): PublishingBlock => ({
        type: "card",
        id: "publishing-attention",
        label:
          data.failures.length === 1
            ? "One delivery needs attention"
            : `${data.failures.length} deliveries need attention`,
        blocks: [block],
      })),
      {
        type: "tabs",
        id: "publishing-queue",
        label: "Publishing queue",
        defaultTab: "queued",
        tabs: [
          {
            id: "queued",
            label: "Queued",
            count: data.queue.length,
            blocks: work.filter(
              (block) => block.type !== "list" || block.id === "dispatch-queue",
            ),
          },
          ...(data.generating.length > 0
            ? [
                {
                  id: "generating",
                  label: "Generating",
                  count: data.generating.length,
                  blocks: work.filter((block) => block.id === "generating"),
                },
              ]
            : []),
        ],
      },
      totals,
    ];
    return {
      kicker: "Publication operations",
      title: "Publishing",
      blocks,
    };
  },
});

/** Register Publishing when Studio is present; absence is intentionally a no-op. */
export async function registerStudioWorkspace(
  context: ServicePluginContext,
  deps: RegisterStudioWorkspaceDeps,
): Promise<string | undefined> {
  const result = await registerBuiltInStudioWorkspace({
    context,
    definition: publishingWorkspace,
    bind: (bindingContext) =>
      publishingWorkspace.bind(bindingContext, {
        authorize: ({ caller }) =>
          caller !== null &&
          getWorkspaceEntityTypes(context, deps.providerRegistry, caller)
            .length > 0,
        listEntityTypes: ({ caller }) =>
          caller
            ? getWorkspaceEntityTypes(context, deps.providerRegistry, caller)
            : [],
        load: ({ caller }) => {
          if (!caller) throw new Error("Publishing requires authentication");
          return getPublicationPipelineSnapshot(
            context,
            deps.providerRegistry,
            deps.queueManager,
            deps.retryTracker,
            {
              visibilityScope: permissionToVisibilityScope(caller.permission),
              entityTypes: getWorkspaceEntityTypes(
                context,
                deps.providerRegistry,
                caller,
              ),
            },
          );
        },
        actions: [
          queueAction.bind(bindingContext, ({ input, caller }) => {
            if (!caller) throw new Error("Publishing requires authentication");
            return mutateQueue(context, deps, "queue", input, caller);
          }),
          removeAction.bind(bindingContext, ({ input, caller }) => {
            if (!caller) throw new Error("Publishing requires authentication");
            return mutateQueue(context, deps, "remove", input, caller);
          }),
          retryAction.bind(bindingContext, ({ input, caller }) => {
            if (!caller) throw new Error("Publishing requires authentication");
            return mutateQueue(context, deps, "retry", input, caller);
          }),
          reorderAction.bind(bindingContext, ({ input, caller }) => {
            if (!caller) throw new Error("Publishing requires authentication");
            return mutateQueue(context, deps, "reorder", input, caller);
          }),
          publishAction.bind(
            bindingContext,
            ({ input, caller }) => {
              if (!caller)
                throw new Error("Publishing requires authentication");
              return publishNow(context, deps, input, caller);
            },
            ({ input, caller }) => {
              if (!caller)
                throw new Error("Publishing requires authentication");
              return preparePublish(context, deps, input, caller);
            },
          ),
        ],
      }),
  });
  return result === false ? undefined : result.workspaceUrl;
}

/** Map a caller-visible queue slot back to the provider's absolute slot. */
async function toAbsoluteQueuePosition(
  context: ServicePluginContext,
  queueManager: QueueManager,
  entityType: string,
  caller: OperatorCaller,
  viewPosition: number,
): Promise<number> {
  const viewEntries = [];
  for (const entry of await queueManager.list(entityType)) {
    const entity = await context.entityService.getEntity({
      entityType,
      id: entry.entityId,
      visibilityScope: permissionToVisibilityScope(caller.permission),
    });
    if (entity && hasPublicationStatus(entity.metadata["status"])) {
      viewEntries.push(entry);
    }
  }
  const clamped = Math.min(Math.max(viewPosition, 1), viewEntries.length);
  return viewEntries[clamped - 1]?.position ?? viewPosition;
}
