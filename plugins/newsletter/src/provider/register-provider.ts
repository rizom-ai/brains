import {
  publishCompletedChannel,
  publishRegisterContract,
} from "@brains/contracts";
import { siteBuilderSlotsContract } from "@brains/site-composition";
import {
  SYSTEM_CHANNELS,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { NewsletterSignup } from "@rizom/brain-ui/internal";
import { createElement as h, type ReactElement } from "react";
import type { NewsletterDeliveryProvider } from "./contracts";
import { handlePublishCompleted } from "./publish-handler";

export interface NewsletterProviderRegistration {
  pluginId: string;
  signupAction: string;
  signupSuccessMessage: string;
  autoSendOnPublish: boolean;
}

/**
 * Register the selected newsletter provider's shared runtime integrations,
 * as the provider classes did: publishing for newsletters once every
 * plugin registered, the site's signup slot in every process, and with
 * auto-send, an issue for each published post.
 */
export function registerNewsletterProvider(
  runtime: Pick<
    ServiceRuntime,
    "listen" | "answer" | "messaging" | "entityReads" | "logger"
  >,
  provider: NewsletterDeliveryProvider,
  options: NewsletterProviderRegistration,
): void {
  const { logger } = runtime;
  runtime.listen(
    SYSTEM_CHANNELS.pluginsRegistered,
    async () => {
      await runtime.messaging.command(publishRegisterContract, {
        entityType: "newsletter",
        provider,
        config: { publishTimestampField: "sentAt" },
      });
      logger.info("Newsletter provider registered", {
        provider: provider.name,
      });
    },
    { mode: "subscribe" },
  );

  // Site builds run in the worker and ask for slots as they render; that
  // process never emits pluginsRegistered, so the signup answers there.
  runtime.answer(
    siteBuilderSlotsContract,
    () => [
      {
        pluginId: options.pluginId,
        slotName: "footer-top",
        render: (): ReactElement =>
          h(NewsletterSignup, {
            variant: "inline",
            action: options.signupAction,
            successMessage: options.signupSuccessMessage,
          }),
      },
    ],
    { everyProcess: true },
  );

  if (!options.autoSendOnPublish) return;

  runtime.listen(
    publishCompletedChannel,
    async ({ payload }) => {
      const result = await handlePublishCompleted(
        payload,
        provider,
        runtime.entityReads,
        logger,
      );
      if (!result.success) {
        logger.error("Newsletter auto-send failed", {
          provider: provider.name,
          entityId: payload.entityId,
          error: result.error,
        });
      }
    },
    { mode: "subscribe" },
  );
  logger.info("Newsletter auto-send on publish enabled", {
    provider: provider.name,
  });
}
