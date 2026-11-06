import type { EntityPluginContext } from "@brains/plugins";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { publishRegisterContract } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";

export function registerWithPublishPipeline(
  context: EntityPluginContext,
  logger: Logger,
): void {
  const internalProvider = {
    name: "internal",
    publish: async (): Promise<{ id: string }> => {
      return { id: "internal" };
    },
  };

  context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
    await context.messaging.command(publishRegisterContract, {
      entityType: "post",
      provider: internalProvider,
      config: { executionMode: "provider" },
    });

    logger.info("Registered post with publish-pipeline");
    return { success: true };
  });
}
