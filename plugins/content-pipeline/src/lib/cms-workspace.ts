import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "../provider-registry";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";
import type { PublicationQueueService } from "../publication-queue-service";
import type { PublishEntityExecutor } from "../publish-executor";
import { getPublicationPipelineSnapshot } from "../pipeline-snapshot";
import { createPublishTool } from "../tools/publish";

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
  const publishTool = createPublishTool(
    context,
    pluginId,
    deps.providerRegistry,
    deps.publishExecutor,
  );
  const registration: CmsWorkspaceRegistration = {
    id: "publishing",
    pluginId,
    label: "Publishing",
    rendererName: "PublishingWorkspace",
    entityTypes: deps.providerRegistry.getRegisteredTypes(),
    dataProvider: () =>
      getPublicationPipelineSnapshot(
        context,
        deps.providerRegistry,
        deps.queueManager,
        deps.retryTracker,
      ),
    actionHandler: async (request, actor) => {
      const parsed = cmsPublishingActionSchema.safeParse(request);
      if (!parsed.success) {
        throw new Error("Invalid publishing workspace action");
      }
      return handlePublishingAction(
        context,
        deps,
        publishTool,
        parsed.data,
        actor,
      );
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

async function handlePublishingAction(
  context: ServicePluginContext,
  deps: RegisterCmsWorkspaceDeps,
  publishTool: ReturnType<typeof createPublishTool>,
  action: CmsPublishingAction,
  actor: CmsWorkspaceActor,
): Promise<unknown> {
  if (!deps.providerRegistry.has(action.entityType)) {
    throw new Error(`No publish provider registered for ${action.entityType}`);
  }

  const entity = await context.entityService.getEntity({
    entityType: action.entityType,
    id: action.entityId,
  });
  if (!entity) {
    throw new Error(
      `Entity not found: ${action.entityType}:${action.entityId}`,
    );
  }

  if (action.type === "publish") {
    const result = await publishTool.handler(
      {
        entityType: action.entityType,
        id: action.entityId,
        ...(action.confirmation ?? {}),
      },
      actor,
    );
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
    actor,
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
        { ...actor, authorization: "user" },
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
        { ...actor, authorization: "user" },
      );
      return { success: true };
    case "reorder":
      if (status !== "queued") {
        throw new Error("Only queued entities can be reordered");
      }
      await deps.publicationQueueService.reorder(
        action.entityType,
        action.entityId,
        action.position,
      );
      return { success: true };
  }
}
