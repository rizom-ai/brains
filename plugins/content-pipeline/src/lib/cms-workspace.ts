import {
  defineCmsWorkspace,
  defineEntityCatalog,
  defineWorkspaceAction,
  permissionToVisibilityScope,
  registerBuiltInCmsWorkspace,
  type OperatorCaller,
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

export interface CmsPublishConfirmation {
  confirmed: true;
  confirmationToken: string;
  contentHash: string;
  expiresAt: string;
}

interface CmsPublishingTarget {
  entityType: string;
  entityId: string;
}

export type CmsPublishingAction =
  | ({ type: "queue" | "remove" | "retry" } & CmsPublishingTarget)
  | ({ type: "reorder"; position: number } & CmsPublishingTarget)
  | ({
      type: "publish";
      confirmation?: CmsPublishConfirmation | undefined;
    } & CmsPublishingTarget);

const publishingTargetSchema = z.object({
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().trim().min(1).max(500),
});
const reorderInputSchema = publishingTargetSchema.extend({
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

export const cmsPublishingActionSchema: z.ZodType<
  CmsPublishingAction,
  CmsPublishingAction
> = z.discriminatedUnion("type", [
  publishingTargetSchema.extend({ type: z.literal("queue") }),
  publishingTargetSchema.extend({ type: z.literal("remove") }),
  publishingTargetSchema.extend({ type: z.literal("retry") }),
  reorderInputSchema.extend({ type: z.literal("reorder") }),
  publishingTargetSchema.extend({
    type: z.literal("publish"),
    confirmation: z
      .object({
        confirmed: z.literal(true),
        confirmationToken: z.string().min(1),
        contentHash: z.string().min(1),
        expiresAt: z.string().datetime(),
      })
      .optional(),
  }),
]);

export interface RegisterCmsWorkspaceDeps {
  providerRegistry: ProviderRegistry;
  queueManager: QueueManager;
  publicationQueueService: PublicationQueueService;
  retryTracker: RetryTracker;
  publishExecutor: PublishEntityExecutor;
}

function toToolContext(caller: OperatorCaller): ToolContext {
  return {
    interfaceType: "cms",
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
  deps: RegisterCmsWorkspaceDeps,
  input: CmsPublishingTarget,
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
  deps: RegisterCmsWorkspaceDeps,
  action: "queue" | "remove" | "retry" | "reorder",
  input: CmsPublishingTarget & { position?: number | undefined },
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
  deps: RegisterCmsWorkspaceDeps,
  input: CmsPublishingTarget,
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
  deps: RegisterCmsWorkspaceDeps,
  input: CmsPublishingTarget,
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

const publishingWorkspace = defineCmsWorkspace({
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
    const blocks: PublishingBlock[] = [
      {
        type: "stats",
        id: "publishing-summary",
        items: [
          { label: "Queued", value: data.summary.queued },
          { label: "Generating", value: data.summary.generating },
          {
            label: "Needs attention",
            value: data.summary.needsOperator,
            tone: data.summary.needsOperator > 0 ? "warn" : "good",
          },
          { label: "Published", value: data.summary.published },
        ],
      },
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
      {
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
      },
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
                input: { entityType: item.entityType, entityId: item.entityId },
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
    return { title: "Publishing desk", blocks };
  },
});

/** Register Publishing when CMS is present; absence is intentionally a no-op. */
export async function registerCmsWorkspace(
  context: ServicePluginContext,
  deps: RegisterCmsWorkspaceDeps,
): Promise<string | undefined> {
  const result = await registerBuiltInCmsWorkspace({
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
