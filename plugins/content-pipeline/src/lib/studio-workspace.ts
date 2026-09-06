import {
  defineStudioWorkspace,
  defineEntityCatalog,
  defineWorkspaceAction,
  permissionToVisibilityScope,
  type OperatorCaller,
  type OperatorRegionBlock,
  type StudioWorkspaceDefinition,
  type WorkspaceActionDefinition,
  type OperatorViewBlock,
  type ToolContext,
} from "@brains/sdk/services";
import type { PipelineRuntime } from "../runtime";
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
  type PublicationPipelineSnapshot,
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
type SuccessSchema = z.ZodObject<{ success: z.ZodLiteral<true> }>;
const successSchema: SuccessSchema = z.object({ success: z.literal(true) });

export const queueAction: WorkspaceActionDefinition<
  "queue",
  PublishingTargetSchema,
  SuccessSchema
> = defineWorkspaceAction({
  name: "queue",
  label: "Add to queue",
  permission: "trusted",
  input: publishingTargetSchema,
  output: successSchema,
});
export const removeAction: WorkspaceActionDefinition<
  "remove",
  PublishingTargetSchema,
  SuccessSchema
> = defineWorkspaceAction({
  name: "remove",
  label: "Remove from queue",
  permission: "trusted",
  input: publishingTargetSchema,
  output: successSchema,
});
export const retryAction: WorkspaceActionDefinition<
  "retry",
  PublishingTargetSchema,
  SuccessSchema
> = defineWorkspaceAction({
  name: "retry",
  label: "Retry publication",
  permission: "trusted",
  input: publishingTargetSchema,
  output: successSchema,
});
export const reorderAction: WorkspaceActionDefinition<
  "reorder",
  typeof reorderInputSchema,
  SuccessSchema
> = defineWorkspaceAction({
  name: "reorder",
  label: "Reorder",
  permission: "trusted",
  input: reorderInputSchema,
  output: successSchema,
});
export const publishAction: WorkspaceActionDefinition<
  "publish",
  PublishingTargetSchema,
  typeof publishOutputSchema
> = defineWorkspaceAction({
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

export interface PipelineWorkspaceDeps {
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
  context: PipelineRuntime,
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
  context: PipelineRuntime,
  deps: PipelineWorkspaceDeps,
  input: StudioPublishingTarget,
  caller: OperatorCaller,
): Promise<{ metadata: Record<string, unknown> }> {
  if (!deps.providerRegistry.has(input.entityType)) {
    throw new Error(`No publish provider registered for ${input.entityType}`);
  }
  const entity = await context.entities.getEntity({
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
  context: PipelineRuntime,
  deps: PipelineWorkspaceDeps,
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
  context: PipelineRuntime,
  deps: PipelineWorkspaceDeps,
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
  context: PipelineRuntime,
  deps: PipelineWorkspaceDeps,
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

export const publishingWorkspace: StudioWorkspaceDefinition<
  "publishing",
  typeof publicationPipelineSnapshotSchema,
  readonly [
    typeof queueAction,
    typeof removeAction,
    typeof retryAction,
    typeof reorderAction,
    typeof publishAction,
  ]
> = defineStudioWorkspace({
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
      type: "stats",
      id: "publishing-summary",
      items: [
        {
          label: "Queued",
          value: data.summary.queued,
          caption: "awaiting dispatch",
        },
        {
          label: "Generating",
          value: data.summary.generating,
          caption: "in progress",
        },
        {
          label: "Needs attention",
          value: data.summary.needsOperator,
          caption: data.summary.needsOperator > 0 ? "failed" : "all clear",
          tone: data.summary.needsOperator > 0 ? "warn" : "good",
        },
        {
          label: "Published",
          value: data.summary.published,
          caption: "all time",
        },
      ],
    };
    const primary: PublishingRegion[] = [
      {
        type: "flow",
        id: "publication-flow",
        label: "Publication flow",
        steps: [
          {
            id: "draft",
            label: "Draft",
            status: data.summary.draft > 0 ? "active" : "idle",
            detail: `${data.summary.draft} ready`,
          },
          {
            id: "queued",
            label: "Queued",
            status: data.summary.queued > 0 ? "active" : "idle",
            detail: `${data.summary.queued} waiting`,
          },
          {
            id: "generating",
            label: "Generating",
            status: data.summary.generating > 0 ? "active" : "idle",
            detail: `${data.summary.generating} active`,
          },
          {
            id: "published",
            label: "Published",
            status: data.summary.published > 0 ? "complete" : "idle",
            detail: `${data.summary.published} complete`,
          },
        ],
      },
    ];
    const pipelineMeters: PublishingRegion = {
      type: "meters",
      id: "publication-meters",
      items: [
        { id: "drafts", label: "Drafts", value: data.summary.draft },
        {
          id: "failed",
          label: "Failed",
          value: data.summary.failed,
          tone: data.summary.failed > 0 ? "warn" : "good",
        },
        {
          id: "published",
          label: "Published",
          value: data.summary.published,
          tone: "good",
        },
      ],
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
                  `${item.entityType}/${item.entityId}`,
                  item.destination,
                  item.scheduledFor ?? "Next dispatch",
                ],
                count: item.position,
                link: targetLink(item.entityType, item.entityId),
                actions: [
                  {
                    action: reorderAction,
                    input: {
                      entityType: item.entityType,
                      entityId: item.entityId,
                      position: Math.max(1, item.position - 1),
                    },
                    disabled: item.position <= 1,
                  },
                  {
                    action: reorderAction,
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
              metadata: [
                `${failure.entityType}/${failure.entityId}`,
                `Retries: ${failure.retryCount}`,
              ],
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
    const blocks: PublishingBlock[] = [
      totals,
      {
        type: "columns",
        id: "publishing-body",
        primary: [...primary, ...work],
        aside: [
          {
            type: "card",
            id: "publishing-pipeline-card",
            label: "Pipeline",
            tone: data.summary.failed > 0 ? "warn" : "neutral",
            blocks: [pipelineMeters],
          },
        ],
      },
    ];
    return {
      kicker: "Publication operations",
      title: "Publishing desk",
      description:
        "Review intent, inspect dispatch order, and resolve publication failures beside the content they belong to.",
      status: {
        label:
          data.summary.needsOperator > 0
            ? "Needs attention"
            : "Pipeline online",
        detail:
          data.summary.generating > 0
            ? `${data.summary.generating} generating`
            : "no active run",
        tone: data.summary.needsOperator > 0 ? "warn" : "good",
      },
      blocks,
    };
  },
});

/** Where a caller stands when they open the desk or press one of its buttons. */
interface WorkspaceRequest<TInput = never> {
  readonly caller: OperatorCaller | null;
  readonly input: TInput;
}

export interface PublishingWorkspaceHandlers {
  authorize(request: { caller: OperatorCaller | null }): boolean;
  listEntityTypes(request: { caller: OperatorCaller | null }): string[];
  load(request: {
    caller: OperatorCaller | null;
  }): Promise<PublicationPipelineSnapshot>;
  queue(request: WorkspaceRequest<StudioPublishingTarget>): Promise<{
    success: true;
  }>;
  remove(request: WorkspaceRequest<StudioPublishingTarget>): Promise<{
    success: true;
  }>;
  retry(request: WorkspaceRequest<StudioPublishingTarget>): Promise<{
    success: true;
  }>;
  reorder(
    request: WorkspaceRequest<z.output<typeof reorderInputSchema>>,
  ): Promise<{ success: true }>;
  publish(
    request: WorkspaceRequest<StudioPublishingTarget>,
  ): Promise<z.output<typeof publishOutputSchema>>;
  preparePublish(
    request: WorkspaceRequest<StudioPublishingTarget>,
  ): Promise<{ summary: string; revision: string }>;
}

/** What the Publishing desk shows and what its buttons do. */
export function publishingWorkspaceHandlers(
  context: PipelineRuntime,
  deps: PipelineWorkspaceDeps,
): PublishingWorkspaceHandlers {
  return {
    authorize: ({ caller }) =>
      caller !== null &&
      getWorkspaceEntityTypes(context, deps.providerRegistry, caller).length >
        0,
    listEntityTypes: ({ caller }) =>
      caller
        ? getWorkspaceEntityTypes(context, deps.providerRegistry, caller)
        : [],
    load: ({ caller }): Promise<PublicationPipelineSnapshot> => {
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
    queue: ({ input, caller }): Promise<{ success: true }> => {
      if (!caller) throw new Error("Publishing requires authentication");
      return mutateQueue(context, deps, "queue", input, caller);
    },
    remove: ({ input, caller }): Promise<{ success: true }> => {
      if (!caller) throw new Error("Publishing requires authentication");
      return mutateQueue(context, deps, "remove", input, caller);
    },
    retry: ({ input, caller }): Promise<{ success: true }> => {
      if (!caller) throw new Error("Publishing requires authentication");
      return mutateQueue(context, deps, "retry", input, caller);
    },
    reorder: ({ input, caller }): Promise<{ success: true }> => {
      if (!caller) throw new Error("Publishing requires authentication");
      return mutateQueue(context, deps, "reorder", input, caller);
    },
    publish: ({
      input,
      caller,
    }): Promise<z.output<typeof publishOutputSchema>> => {
      if (!caller) throw new Error("Publishing requires authentication");
      return publishNow(context, deps, input, caller);
    },
    preparePublish: ({
      input,
      caller,
    }): Promise<{ summary: string; revision: string }> => {
      if (!caller) throw new Error("Publishing requires authentication");
      return preparePublish(context, deps, input, caller);
    },
  };
}

/** Map a caller-visible queue slot back to the provider's absolute slot. */
async function toAbsoluteQueuePosition(
  context: PipelineRuntime,
  queueManager: QueueManager,
  entityType: string,
  caller: OperatorCaller,
  viewPosition: number,
): Promise<number> {
  const viewEntries = [];
  for (const entry of await queueManager.list(entityType)) {
    const entity = await context.entities.getEntity({
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
