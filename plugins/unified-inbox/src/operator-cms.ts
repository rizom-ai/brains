import {
  registerCmsWorkspace,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import type { InboxOperatorService } from "./operator-service";
import {
  inboxActionOutcomeSchema,
  inboxActionRequestSchema,
  inboxWorkspaceQuerySchema,
} from "./schemas";

export async function registerUnifiedInboxCmsWorkspace(
  context: ServicePluginContext,
  operator: InboxOperatorService,
): Promise<string | undefined> {
  const registration: CmsWorkspaceRegistration = {
    id: "inbox",
    pluginId: context.pluginId,
    label: "Inbox",
    rendererName: "UnifiedInboxWorkspace",
    priority: 20,
    accessHandler: (actor) => actor.userPermissionLevel === "admin",
    dataProvider: async (actor, input) => {
      assertInboxAdmin(actor);
      const query = inboxWorkspaceQuerySchema.safeParse(input ?? {});
      if (!query.success) throw new Error("Invalid unified inbox query");
      return operator.workspace(query.data);
    },
    actionHandler: async (input, actor) => {
      assertInboxAdmin(actor);
      const request = inboxActionRequestSchema.safeParse(input);
      if (!request.success) {
        return inboxActionOutcomeSchema.parse({
          kind: "error",
          error: "Invalid inbox action",
        });
      }
      try {
        return await operator.act(request.data, {
          permissionLevel: actor.userPermissionLevel,
        });
      } catch (error) {
        context.logger.error("Unified inbox workspace action failed", {
          error,
        });
        return inboxActionOutcomeSchema.parse({
          kind: "error",
          error: "Inbox action failed",
        });
      }
    },
    badgeProvider: async (actor) => {
      assertInboxAdmin(actor);
      return operator.badge();
    },
  };

  return registerCmsWorkspace(context, registration);
}

function assertInboxAdmin(actor: CmsWorkspaceActor): void {
  if (actor.userPermissionLevel !== "admin") {
    throw new Error("Unified inbox requires admin permission");
  }
}
