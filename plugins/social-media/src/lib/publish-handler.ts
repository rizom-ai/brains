import type { ServicePluginContext } from "@brains/plugins";
import type { Logger, PublishProvider } from "@brains/utils";
import {
  PublishExecuteHandler,
  type PublishExecutePayload,
} from "../handlers/publishExecuteHandler";

export async function registerWithPublishPipeline(
  context: ServicePluginContext,
  providers: Map<string, PublishProvider>,
  logger: Logger,
): Promise<void> {
  if (providers.size === 0) {
    logger.debug(
      "No providers configured, skipping publish-pipeline registration",
    );
    return;
  }

  const provider = providers.values().next().value;

  await context.messaging.send("publish:register", {
    entityType: "social-post",
    provider: provider,
  });

  logger.info("Registered social-post with publish-pipeline");
}

export function subscribeToPublishExecute(
  context: ServicePluginContext,
  providers: Map<string, PublishProvider>,
  logger: Logger,
): void {
  const executeHandler = new PublishExecuteHandler({
    sendMessage: context.messaging.send,
    logger: logger.child("PublishExecuteHandler"),
    entityService: context.entityService,
    providers,
  });

  context.messaging.subscribe<PublishExecutePayload, { success: boolean }>(
    "publish:execute",
    async (msg) => {
      await executeHandler.handle(msg.payload);
      return { success: true };
    },
  );

  logger.debug("Subscribed to publish:execute messages");
}
