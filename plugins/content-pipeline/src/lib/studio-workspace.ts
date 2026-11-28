import {
  defineStudioWorkspace,
  defineEntityCatalog,
  defineWorkspaceAction,
  type OperatorCaller,
  type OperatorViewBlock,
} from "@brains/sdk/services";
import { permissionToVisibilityScope } from "@brains/sdk/internal/interface-runtime";
import type {
  ToolContext,
  ServiceStudio,
} from "@brains/sdk/internal/service-runtime";
import { SdkError } from "@brains/contracts";
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
import type { PipelineContext } from "./pipeline-context";

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
  context: PipelineContext,
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
  context: PipelineContext,
  deps: RegisterStudioWorkspaceDeps,
  input: StudioPublishingTarget,
  caller: OperatorCaller,
): Promise<{ metadata: Record<string, unknown> }> {
  // A refusal reaches the operator by its code and public message.
  if (!deps.providerRegistry.has(input.entityType)) {
    throw new SdkError("not_found", {
      publicMessage: `No publish provider registered for ${input.entityType}`,
    });
  }
  const entity = await context.entityService.getEntity({
    entityType: input.entityType,
    id: input.entityId,
    visibilityScope: permissionToVisibilityScope(caller.permission),
  });
  if (!entity) {
    throw new SdkError("not_found", {
      publicMessage: `Entity not found: ${input.entityType}:${input.entityId}`,
    });
  }
  return entity;
}

async function mutateQueue(
  context: PipelineContext,
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
  context: PipelineContext,
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
  if ("error" in candidate) {
    throw new SdkError("conflict", { publicMessage: candidate.error });
  }
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
  context: PipelineContext,
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
  section: "publish",
  entityCatalog: publishableEntities,
  publishesEntityTypes: true,
  data: publicationPipelineSnapshotSchema,
  actions: [
    queueAction,
    removeAction,
    retryAction,
    reorderAction,
    publishAction,
  ],
  view: ({ data }) => {
    type PublishingAction =
      | typeof queueAction
      | typeof removeAction
      | typeof retryAction
      | typeof reorderAction
      | typeof publishAction;
    type PublishingBlock = OperatorViewBlock<PublishingAction>;
    const target = (item: {
      entityType: string;
      entityId: string;
    }): { entityType: string; entityId: string } => ({
      entityType: item.entityType,
      entityId: item.entityId,
    });
    // One board from draft to out the door: a card moves on by its button,
    // or by dragging it to the column its move leads to.
    const board: PublishingBlock = {
      type: "matrix",
      id: "publishing-board",
      columns: 4,
      cells: [
        {
          id: "drafts",
          label: "Drafts",
          empty: "No drafts.",
          items: data.drafts.map((draft) => ({
            id: `draft-${draft.entityType}-${draft.entityId}`,
            title: draft.title,
            ...(draft.missing.length > 0
              ? { description: `Needs ${joinedWords(draft.missing)}` }
              : {}),
            metadata: [typeLabel(draft.entityType)],
            link: targetLink(draft.entityType, draft.entityId),
            actions: [
              {
                action: queueAction,
                label: "Queue",
                input: target(draft),
                dropTarget: "queued",
                disabled: draft.missing.length > 0,
              },
            ],
          })),
        },
        {
          id: "queued",
          label: "Queued",
          empty: "Nothing is queued.",
          items: data.queue.map((item) => {
            const destinationCount = data.queue.filter(
              (candidate) => candidate.entityType === item.entityType,
            ).length;
            return {
              id: `queue-${item.entityType}-${item.position}`,
              title: item.title,
              metadata: [
                typeLabel(item.entityType),
                item.destination,
                item.scheduledFor
                  ? `Scheduled: ${item.scheduledFor}`
                  : `Position ${item.position}`,
              ],
              link: targetLink(item.entityType, item.entityId),
              actionsLabel: "Queue options",
              actions: [
                {
                  action: reorderAction,
                  label: "Move up",
                  input: {
                    ...target(item),
                    position: Math.max(1, item.position - 1),
                  },
                  disabled: item.position <= 1,
                },
                {
                  action: reorderAction,
                  label: "Move down",
                  input: { ...target(item), position: item.position + 1 },
                  disabled: item.position >= destinationCount,
                },
                {
                  action: removeAction,
                  label: "Back to drafts",
                  input: target(item),
                  dropTarget: "drafts",
                },
              ],
            };
          }),
        },
        {
          id: "published",
          label: "Published",
          empty: "Nothing published yet.",
          items: data.published.map((entry) => ({
            id: `published-${entry.entityType}-${entry.entityId}`,
            title: entry.title,
            metadata: [
              typeLabel(entry.entityType),
              entry.destination,
              ...(entry.publishedAt ? [shortDate(entry.publishedAt)] : []),
            ],
            link: targetLink(entry.entityType, entry.entityId),
          })),
        },
        {
          id: "failed",
          label: "Failed",
          tone: data.failures.length > 0 ? "error" : undefined,
          empty: "Nothing failed.",
          items: data.failures.map((failure) => ({
            id: `failure-${failure.entityType}-${failure.entityId}`,
            title: failure.title,
            description: failure.error,
            metadata: [
              typeLabel(failure.entityType),
              `Retries: ${failure.retryCount}`,
            ],
            tone: "error",
            link: targetLink(failure.entityType, failure.entityId),
            actions: [
              {
                action: retryAction,
                input: target(failure),
                dropTarget: "queued",
              },
            ],
          })),
        },
      ],
    };
    const preparing: PublishingBlock[] =
      data.generating.length > 0
        ? [
            {
              type: "card",
              id: "publishing-preparing",
              presentation: "disclosure",
              label:
                data.generating.length === 1
                  ? "One entry is being prepared"
                  : `${data.generating.length} entries are being prepared`,
              blocks: [
                {
                  type: "list",
                  id: "generating",
                  empty: "Nothing is being prepared.",
                  items: data.generating.map((job, index) => {
                    const [entityType, ...entityId] = job.target.split("/");
                    return {
                      id: `generating-${index + 1}`,
                      title: job.label,
                      metadata: [job.target, job.status],
                      ...(entityType && entityId.length > 0
                        ? { link: targetLink(entityType, entityId.join("/")) }
                        : {}),
                    };
                  }),
                },
              ],
            },
          ]
        : [];
    return {
      kicker: "Publication operations",
      title: "Publishing",
      status: { label: `${data.summary.published} published`, tone: "neutral" },
      blocks: [...preparing, board],
    };
  },
});

/** Register Publishing when Studio is present; absence is intentionally a no-op. */
export async function registerStudioWorkspace(
  studio: ServiceStudio,
  context: PipelineContext,
  deps: RegisterStudioWorkspaceDeps,
): Promise<string | undefined> {
  if (!studio.isAvailable()) return undefined;
  const registration = studio.source({
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
  return studio.register(registration);
}

/** Map a caller-visible queue slot back to the provider's absolute slot. */
async function toAbsoluteQueuePosition(
  context: PipelineContext,
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

/** "social-post" reads as "Social post". */
function typeLabel(entityType: string): string {
  const words = entityType.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "excerpt and author" */
function joinedWords(words: readonly string[]): string {
  return words.length <= 1
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

/** "10 Jul": when it went out, read the same everywhere. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
}
