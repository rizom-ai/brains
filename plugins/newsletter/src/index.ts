import { PUBLISH_CHANNELS, SITE_BUILDER_CHANNELS } from "@brains/contracts";
import {
  defineRoute,
  defineServicePlugin,
  defineSubscription,
  verbatim,
  type LoggerContract,
  type PublishProvider,
  type PublishResult,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { NewsletterSignup } from "@rizom/brain-ui";
import { createElement as h } from "react";
import { newsletterConfigSchema } from "./config";
import { newsletterEntity } from "./entity";
import {
  ButtondownClient,
  type ButtondownFetch,
} from "./lib/buttondown-client";
import {
  handlePublishCompleted,
  publishCompletedSchema,
} from "./lib/publish-handler";
import { handleSubscribe, SUBSCRIBE_PATH } from "./routes";
import { subscribersTool } from "./tools";

/**
 * The newsletter package: an issue is an entity the brain writes; sending it,
 * managing who receives it, and taking signups is Buttondown's work and
 * belongs to the service half.
 *
 * Nothing here runs without an API key. Without one the service declares no
 * tool, no route, no publisher and no signup form, so a brain that does not
 * send newsletters carries only the entity type.
 */

/**
 * What this package reaches Buttondown through, for a test to supply.
 * Production passes nothing and the client uses the global fetch.
 */
export interface NewsletterDependencies {
  readonly fetch?: ButtondownFetch | undefined;
}

interface NewsletterState {
  readonly client: ButtondownClient | undefined;
  readonly logger: LoggerContract;
}

/** Publishing an issue is sending it. */
function buttondownProvider(client: ButtondownClient): PublishProvider {
  return {
    name: "buttondown",
    publish: async (content, metadata): Promise<PublishResult> => {
      const subject =
        typeof metadata["subject"] === "string" ? metadata["subject"] : "";
      const email = await client.createEmail({
        subject,
        body: content,
        status: "about_to_send",
      });
      return { id: email.id };
    },
  };
}

export function newsletterService(
  dependencies: NewsletterDependencies = {},
): ServicePackageDefinition<typeof newsletterConfigSchema> {
  return defineServicePlugin(
    {
      id: "buttondown",
      config: newsletterConfigSchema,
      entities: [newsletterEntity],

      setup: ({ config, logger }): NewsletterState => ({
        client: config.apiKey
          ? new ButtondownClient(
              { apiKey: config.apiKey, doubleOptIn: config.doubleOptIn },
              logger,
              { fetch: dependencies.fetch },
            )
          : undefined,
        logger,
      }),
    },
    {
      tools: ({ state }) =>
        state.client ? [subscribersTool(state.client)] : [],

      routes: ({ config, state }) =>
        config.apiKey
          ? [
              defineRoute({
                method: "POST",
                path: SUBSCRIBE_PATH,
                security: { kind: "public" },
                response: verbatim,
                handle: ({ request }) => handleSubscribe(request, state.client),
              }),
            ]
          : [],

      // A published post goes out to subscribers, when the operator asked for
      // that. Throwing is how the handler reports a failed send to the bus.
      subscriptions: ({ config, state }) =>
        config.autoSendOnPublish && state.client
          ? [
              defineSubscription({
                topic: PUBLISH_CHANNELS.completed,
                payload: publishCompletedSchema,
                handle: async ({ payload, entities }) => {
                  const client = state.client;
                  if (!client) throw new Error("Buttondown is not configured");
                  const result = await handlePublishCompleted(
                    payload,
                    client,
                    entities,
                    state.logger,
                  );
                  if (!result.success) {
                    state.logger.error("Buttondown auto-send failed", {
                      entityId: payload.entityId,
                      error: result.error,
                    });
                    throw new Error(result.error);
                  }
                  return result;
                },
              }),
            ]
          : [],

      publish: ({ state }) =>
        state.client
          ? [
              {
                entityType: "newsletter",
                provider: buttondownProvider(state.client),
                resultIdField: "buttondownId",
                timestampField: "sentAt",
              },
            ]
          : [],

      // The signup form in the site footer, offered once every plugin has
      // registered so the site builder is listening for slots.
      ready: async ({ config, messaging }) => {
        if (!config.apiKey) return;
        await messaging.send({
          type: SITE_BUILDER_CHANNELS.slotRegister,
          payload: {
            pluginId: "buttondown",
            slotName: "footer-top",
            render: () => h(NewsletterSignup, { variant: "inline" }),
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
