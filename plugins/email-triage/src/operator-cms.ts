import {
  registerCmsWorkspace,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { assertMailTriageAdmin } from "./operator-service";
import type { MailTriageOperatorService } from "./operator-service";
import { mailTriageStatusActionSchema } from "./schemas/operator";

export async function registerEmailTriageCmsWorkspace(
  context: ServicePluginContext,
  operator: MailTriageOperatorService,
): Promise<string | undefined> {
  const registration: CmsWorkspaceRegistration = {
    id: "email-triage",
    pluginId: context.pluginId,
    label: "Email Triage",
    rendererName: "EmailTriageWorkspace",
    priority: 30,
    entityTypes: ["mail-item"],
    accessHandler: (actor) => actor.userPermissionLevel === "admin",
    dataProvider: async (actor) => {
      assertMailTriageAdmin(actor);
      return operator.snapshot();
    },
    actionHandler: async (input, actor) => {
      const parsed = mailTriageStatusActionSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error("Invalid email triage workspace action");
      }
      return operator.act(parsed.data, actor);
    },
    badgeProvider: async (actor) => {
      assertMailTriageAdmin(actor);
      return (await operator.summary()).new;
    },
  };

  return registerCmsWorkspace(context, registration);
}
