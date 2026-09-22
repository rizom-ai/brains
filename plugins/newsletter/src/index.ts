import { PUBLISH_CHANNELS, SITE_BUILDER_CHANNELS } from "@brains/contracts";
import {
  defineRoute,
  defineServicePlugin,
  SdkError,
  defineSubscription,
  verbatim,
  type LoggerContract,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { NewsletterSignup } from "@rizom/brain-ui";
import { createElement as h } from "react";
import { newsletterConfigSchema } from "./config";
import { newsletterEntity } from "./entity";
import type { ButtondownFetch } from "./lib/buttondown-client";
import { ButtondownNewsletterProvider } from "./buttondown-provider";
import { ResendNewsletterProvider } from "./resend/resend-provider";
import type { NewsletterDeliveryProvider } from "./contracts";
import {
  handlePublishCompleted,
  publishCompletedSchema,
} from "./lib/publish-handler";
import { handleSubscribe, SUBSCRIBE_PATH } from "./routes";
import { subscribersTool } from "./tools";

/** Tests supply transport; production uses global fetch. */
export interface NewsletterDependencies {
  readonly fetch?: ButtondownFetch | undefined;
}
interface NewsletterState {
  readonly provider: NewsletterDeliveryProvider | undefined;
  readonly logger: LoggerContract;
}

/** Declarative entity plus optional, provider-neutral delivery service. */
export function newsletterService(
  dependencies: NewsletterDependencies = {},
): ServicePackageDefinition<typeof newsletterConfigSchema> {
  return defineServicePlugin(
    {
      id: "delivery",
      config: newsletterConfigSchema,
      entities: [newsletterEntity],
      setup: ({ config, logger }): NewsletterState => {
        const provider = config.provider;
        return {
          provider:
            provider?.type === "buttondown"
              ? new ButtondownNewsletterProvider(provider, logger, dependencies)
              : provider?.type === "resend"
                ? new ResendNewsletterProvider(provider, logger, dependencies)
                : undefined,
          logger,
        };
      },
    },
    {
      tools: ({ state }) =>
        state.provider ? [subscribersTool(state.provider)] : [],
      routes: ({ state }) =>
        state.provider
          ? [
              defineRoute({
                method: "POST",
                path: SUBSCRIBE_PATH,
                security: { kind: "public" },
                response: verbatim,
                handle: ({ request }) =>
                  handleSubscribe(request, state.provider),
              }),
            ]
          : [],
      subscriptions: ({ config, state }) =>
        config.autoSendOnPublish && state.provider
          ? [
              defineSubscription({
                topic: PUBLISH_CHANNELS.completed,
                payload: publishCompletedSchema,
                handle: async ({ payload, entities }) => {
                  const provider = state.provider;
                  if (!provider)
                    throw new Error("Newsletter is not configured");
                  const result = await handlePublishCompleted(
                    payload,
                    provider,
                    entities,
                    state.logger,
                  );
                  if (!result.success) {
                    state.logger.error("Newsletter auto-send failed", {
                      entityId: payload.entityId,
                      error: result.error,
                    });
                    if (result.code)
                      throw new SdkError(result.code, {
                        publicMessage: result.error,
                      });
                    throw new Error(result.error);
                  }
                  return result;
                },
              }),
            ]
          : [],
      publish: ({ state }) =>
        state.provider
          ? [
              {
                entityType: "newsletter",
                provider: state.provider,
                resultIdField:
                  state.provider.name === "resend"
                    ? "resendBroadcastId"
                    : "buttondownId",
                timestampField: "sentAt",
              },
            ]
          : [],
      ready: async ({ state, messaging }) => {
        if (!state.provider) return;
        await messaging.request({
          type: SITE_BUILDER_CHANNELS.slotRegister,
          payload: {
            pluginId: "delivery",
            slotName: "footer-top",
            render: () =>
              h(NewsletterSignup, {
                variant: "inline",
                action: SUBSCRIBE_PATH,
                successMessage:
                  state.provider?.name === "resend"
                    ? "You are subscribed."
                    : "Check your email to confirm your subscription.",
              }),
          },
        });
      },
    },
  );
}
const newsletterPackage: ServicePackageDefinition<
  typeof newsletterConfigSchema
> = newsletterService();
export default newsletterPackage;
export { newsletterEntity } from "./entity";
export {
  newsletterConfigSchema,
  type NewsletterConfig,
  type NewsletterConfigInput,
} from "./config";
export type {
  Newsletter,
  NewsletterMetadata,
  NewsletterStatus,
  CreateNewsletterInput,
} from "./schemas/newsletter";
export {
  newsletterSchema,
  newsletterMetadataSchema,
  newsletterStatusSchema,
  createNewsletter,
} from "./schemas/newsletter";
export {
  newsletterGeneration,
  generationJobSchema,
  type GenerationJobData,
} from "./handlers/generation";
export { ButtondownClient } from "./lib/buttondown-client";
export type {
  Subscriber,
  SubscriberType,
  CreateSubscriberInput,
  ButtondownEmail,
  EmailStatus,
  CreateEmailInput,
} from "./lib/buttondown-client";
export { ButtondownNewsletterProvider } from "./buttondown-provider";
export { ResendNewsletterProvider } from "./resend/resend-provider";
export { ResendNewsletterClient, ResendApiError } from "./resend/resend-client";
export { renderNewsletterEmail } from "./email-renderer";
export type {
  NewsletterDeliveryProvider,
  NewsletterSubscriber,
  NewsletterSubscriberList,
  NewsletterSubscriberListInput,
  NewsletterSubscriberStatus,
  NewsletterSubscribeInput,
} from "./contracts";
export type {
  ResendClientConfig,
  ResendContact,
  ResendContactList,
  ResendBroadcast,
  ResendBroadcastInput,
} from "./resend/resend-client";
export type {
  RenderNewsletterEmailInput,
  RenderedNewsletterEmail,
} from "./email-renderer";
