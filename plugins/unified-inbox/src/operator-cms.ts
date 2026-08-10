import {
  assertCmsWorkspaceAdmin,
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
  inboxWorkspaceSnapshotSchema,
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
      const [snapshot, appInfo] = await Promise.all([
        operator.workspace(query.data),
        context.appInfo(),
      ]);
      const adminHref = appInfo.interactions.find(
        (interaction) =>
          interaction.id === "admin" &&
          interaction.kind === "admin" &&
          interaction.visibility === "admin" &&
          interaction.status === "available",
      )?.href;
      return inboxWorkspaceSnapshotSchema.parse({
        ...snapshot,
        entries: snapshot.entries.map((entry) => {
          const personId = entry.item.contact?.personId;
          const contactHref =
            personId && adminHref
              ? createContactHref(adminHref, personId)
              : undefined;
          return {
            ...entry,
            ...(contactHref ? { contactHref } : {}),
          };
        }),
      });
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

function createContactHref(
  registeredHref: string,
  personId: string,
): string | undefined {
  if (
    registeredHref.length > 2_048 ||
    !registeredHref.startsWith("/") ||
    registeredHref.startsWith("//") ||
    registeredHref.includes("\\") ||
    /[\p{Cc}\p{Cf}]/u.test(registeredHref)
  ) {
    return undefined;
  }
  try {
    const url = new URL(registeredHref, "https://brains.invalid");
    if (url.origin !== "https://brains.invalid") return undefined;
    url.searchParams.set("person", personId);
    const target = `${url.pathname}${url.search}${url.hash}`;
    return target.length <= 2_048 ? target : undefined;
  } catch {
    return undefined;
  }
}

function assertInboxAdmin(actor: CmsWorkspaceActor): void {
  assertCmsWorkspaceAdmin(actor, "Unified inbox");
}
