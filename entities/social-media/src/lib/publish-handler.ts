import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, PublishProvider } from "@brains/utils";
import {
  PublishExecuteHandler,
  type PublishExecutePayload,
} from "../handlers/publishExecuteHandler";

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

  // Defer to system:plugins:ready so content-pipeline has subscribed
  // to publish:register before we send it (order-independent)
  context.messaging.subscribe("system:plugins:ready", async () => {
    const provider = providers.values().next().value;

    await context.messaging.send({
      type: "publish:register",
      payload: {
        entityType: "social-post",
        provider: provider,
      },
    });

    logger.info("Registered social-post with publish-pipeline");
    return { success: true };
  });
}

export function subscribeToPublishExecute(
  context: EntityPluginContext,
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
