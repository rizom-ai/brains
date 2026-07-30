import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
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
} from "../pipeline-snapshot";
import { handlePublishAction } from "../tools/publish";

const registrationResultSchema = z.object({
  workspaceUrl: z.string(),
});

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

const publishConfirmationSchema: z.ZodType<
  CmsPublishConfirmation,
  CmsPublishConfirmation
> = z.object({
  confirmed: z.literal(true),
  confirmationToken: z.string().min(1),
  contentHash: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export const cmsPublishingActionSchema: z.ZodType<
  CmsPublishingAction,
  CmsPublishingAction
> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("queue"),
    entityType: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("remove"),
    entityType: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("retry"),
    entityType: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("reorder"),
    entityType: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
    position: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("publish"),
    entityType: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
    confirmation: publishConfirmationSchema.optional(),
  }),
]);

export interface RegisterCmsWorkspaceDeps {
  providerRegistry: ProviderRegistry;
  queueManager: QueueManager;
  publicationQueueService: PublicationQueueService;
  retryTracker: RetryTracker;
  publishExecutor: PublishEntityExecutor;
}

/** Register Publishing when CMS is present; absence is intentionally a no-op. */
export async function registerCmsWorkspace(
  context: ServicePluginContext,
  pluginId: string,
  deps: RegisterCmsWorkspaceDeps,
): Promise<string | undefined> {
  const registration: CmsWorkspaceRegistration = {
    id: "publishing",
    pluginId,
    label: "Publishing",
    rendererName: "PublishingWorkspace",
    priority: 40,
    entityTypes: (actor) =>
      getWorkspaceEntityTypes(context, deps.providerRegistry, actor),
    accessHandler: (actor) =>
      getWorkspaceEntityTypes(context, deps.providerRegistry, actor).length > 0,
    dataProvider: (actor) =>
      getPublicationPipelineSnapshot(
        context,
        deps.providerRegistry,
        deps.queueManager,
        deps.retryTracker,
        {
          visibilityScope: actor.visibilityScope,
          entityTypes: getWorkspaceEntityTypes(
            context,
            deps.providerRegistry,
            actor,
          ),
        },
      ),
    actionHandler: async (request, actor) => {
      const parsed = cmsPublishingActionSchema.safeParse(request);
      if (!parsed.success) {
        throw new Error("Invalid publishing workspace action");
      }
      return handlePublishingAction(context, deps, parsed.data, actor);
    },
  };

  const response = await context.messaging.send({
    type: CMS_WORKSPACE_REGISTER_MESSAGE,
    payload: registration,
  });
  if (!("success" in response) || !response.success) return undefined;

  const parsed = registrationResultSchema.safeParse(response.data);
  return parsed.success ? parsed.data.workspaceUrl : undefined;
}

function toToolContext(actor: CmsWorkspaceActor): ToolContext {
  return {
    interfaceType: actor.interfaceType,
    actor: actor.actor,
    userPermissionLevel: actor.userPermissionLevel,
  };
}

function getWorkspaceEntityTypes(
  context: ServicePluginContext,
  providerRegistry: ProviderRegistry,
  actor: CmsWorkspaceActor,
): string[] {
  const toolContext = toToolContext(actor);
  const workspaceActions: Array<"update" | "publish"> = ["update", "publish"];
  return providerRegistry.getRegisteredTypes().filter((entityType) => {
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

async function handlePublishingAction(
  context: ServicePluginContext,
  deps: RegisterCmsWorkspaceDeps,
  action: CmsPublishingAction,
  actor: CmsWorkspaceActor,
): Promise<unknown> {
  if (!deps.providerRegistry.has(action.entityType)) {
    throw new Error(`No publish provider registered for ${action.entityType}`);
  }

  const entity = await context.entityService.getEntity({
    entityType: action.entityType,
    id: action.entityId,
    visibilityScope: actor.visibilityScope,
  });
  if (!entity) {
    throw new Error(
      `Entity not found: ${action.entityType}:${action.entityId}`,
    );
  }

  const toolContext = toToolContext(actor);

  if (action.type === "publish") {
    const result = await handlePublishAction({
      context,
      executor: deps.publishExecutor,
      toolName: "publishing_manage",
      rawInput: {
        entityType: action.entityType,
        id: action.entityId,
        ...(action.confirmation ?? {}),
      },
      toolContext,
    });
    if ("success" in result && result.success === true) {
      await deps.publicationQueueService.complete(
        action.entityType,
        action.entityId,
      );
      deps.retryTracker.clearRetries(action.entityId);
    }
    return result;
  }

  const permissionAction =
    action.type === "queue" || action.type === "retry" ? "publish" : "update";
  context.permissions.assertEntityActionAllowed(
    action.entityType,
    permissionAction,
    toolContext,
  );

  const status = entity.metadata["status"];
  switch (action.type) {
    case "queue":
      if (status !== "draft") {
        throw new Error("Only draft entities can be queued");
      }
      return deps.publicationQueueService.enqueue(
        action.entityType,
        action.entityId,
        { ...toolContext, authorization: "user" },
      );
    case "remove":
      if (status !== "queued") {
        throw new Error("Only queued entities can be removed from the queue");
      }
      await deps.publicationQueueService.remove(
        action.entityType,
        action.entityId,
      );
      return { success: true };
    case "retry":
      if (status !== "failed") {
        throw new Error("Only failed publications can be retried");
      }
      await deps.publicationQueueService.enqueue(
        action.entityType,
        action.entityId,
        { ...toolContext, authorization: "user" },
      );
      return { success: true };
    case "reorder":
      if (status !== "queued") {
        throw new Error("Only queued entities can be reordered");
      }
      await deps.publicationQueueService.reorder(
        action.entityType,
        action.entityId,
        await toAbsoluteQueuePosition(
          context,
          deps.queueManager,
          action.entityType,
          actor,
          action.position,
        ),
      );
      return { success: true };
  }
}

/**
 * Snapshot queue rows renumber positions to the caller's view after
 * visibility filtering, so an incoming reorder position is a view slot,
 * not an absolute queue slot. Map it to the absolute position of the entry
 * the caller currently sees there; full-visibility callers get the
 * identity mapping.
 */
async function toAbsoluteQueuePosition(
  context: ServicePluginContext,
  queueManager: QueueManager,
  entityType: string,
  actor: CmsWorkspaceActor,
  viewPosition: number,
): Promise<number> {
  const viewEntries = [];
  for (const entry of await queueManager.list(entityType)) {
    const entity = await context.entityService.getEntity({
      entityType,
      id: entry.entityId,
      visibilityScope: actor.visibilityScope,
    });
    if (entity && hasPublicationStatus(entity.metadata["status"])) {
      viewEntries.push(entry);
    }
  }
  const clamped = Math.min(Math.max(viewPosition, 1), viewEntries.length);
  return viewEntries[clamped - 1]?.position ?? viewPosition;
}
