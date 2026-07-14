import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "../provider-registry";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";
import { getPublicationPipelineSnapshot } from "../pipeline-snapshot";

const registrationResultSchema = z.object({
  workspaceUrl: z.string(),
});

export interface RegisterCmsWorkspaceDeps {
  providerRegistry: ProviderRegistry;
  queueManager: QueueManager;
  retryTracker: RetryTracker;
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
    entityTypes: deps.providerRegistry.getRegisteredTypes(),
    dataProvider: () =>
      getPublicationPipelineSnapshot(
        context,
        deps.providerRegistry,
        deps.queueManager,
        deps.retryTracker,
      ),
  };

  const response = await context.messaging.send({
    type: CMS_WORKSPACE_REGISTER_MESSAGE,
    payload: registration,
  });
  if (!("success" in response) || !response.success) return undefined;

  const parsed = registrationResultSchema.safeParse(response.data);
  return parsed.success ? parsed.data.workspaceUrl : undefined;
}
