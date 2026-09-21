import { PUBLISH_CHANNELS, SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { SYSTEM_CHANNELS, type ServicePluginContext } from "@brains/plugins";
import { NewsletterSignup } from "@brains/ui-library";
import type { Logger } from "@brains/utils/logger";
import { createElement as h } from "react";
import type { NewsletterDeliveryProvider } from "./contracts";
import {
  handlePublishCompleted,
  type PublishCompletedPayload,
} from "./publish-handler";

export interface NewsletterProviderRegistration {
  pluginId: string;
  publishResultIdField: string;
  signupAction: string;
  signupSuccessMessage: string;
  autoSendOnPublish: boolean;
}

/** Register the selected newsletter provider's shared runtime integrations. */
export function registerNewsletterProvider(
  context: ServicePluginContext,
  provider: NewsletterDeliveryProvider,
  options: NewsletterProviderRegistration,
  logger: Logger,
): void {
  context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
    await context.messaging.send({
      type: PUBLISH_CHANNELS.register,
      payload: {
        entityType: "newsletter",
        provider,
        config: {
          publishResultIdField: options.publishResultIdField,
          publishTimestampField: "sentAt",
        },
      },
    });

    await context.messaging.send({
      type: SITE_BUILDER_CHANNELS.slotRegister,
      payload: {
        pluginId: options.pluginId,
        slotName: "footer-top",
        render: () =>
          h(NewsletterSignup, {
            variant: "inline",
            action: options.signupAction,
            successMessage: options.signupSuccessMessage,
          }),
      },
    });

    logger.info("Newsletter provider registered", {
      provider: provider.name,
    });
    return { success: true };
  });

  if (!options.autoSendOnPublish) return;

  context.messaging.subscribe<PublishCompletedPayload>(
    PUBLISH_CHANNELS.completed,
    async (msg) => {
      const result = await handlePublishCompleted(
        msg.payload,
        provider,
        context.entityService,
        logger,
      );
      if (!result.success) {
        logger.error("Newsletter auto-send failed", {
          provider: provider.name,
          entityId: msg.payload.entityId,
          error: result.error,
        });
        return { success: false, error: result.error };
      }
      return { success: true };
    },
  );
  logger.info("Newsletter auto-send on publish enabled", {
    provider: provider.name,
  });
}
