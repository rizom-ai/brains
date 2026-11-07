import { SYSTEM_CHANNELS, type EntityPluginContext } from "@brains/plugins";
import {
  publishRegisterContract,
  type PublishProvider,
} from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";

export function registerWithPublishPipeline(
  context: EntityPluginContext,
  providers: Map<string, PublishProvider>,
  logger: Logger,
): void {
  if (providers.size === 0) {
    logger.debug(
      "No providers configured, skipping publish-pipeline registration",
    );
    return;
  }

  // Defer to plugins-registered so content-pipeline has subscribed
  // to publish:register before we send it (order-independent)
  context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
    const provider = providers.values().next().value;

    await context.messaging.command(publishRegisterContract, {
      entityType: "social-post",
      provider: provider,
      config: { publishResultIdField: "platformPostId" },
    });

    logger.info("Registered social-post with publish-pipeline");
    return { success: true };
  });
}
