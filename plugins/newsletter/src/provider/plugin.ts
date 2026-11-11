import { defineServicePlugin, z } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  serviceRuntime,
  withApiRoutes,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import type { ApiRouteDefinition } from "@brains/plugins";
import { ButtondownNewsletterProvider } from "./buttondown-provider";
import type { ButtondownClientDeps } from "./lib/buttondown-client";
import { registerNewsletterProvider } from "./register-provider";
import { createNewsletterSubscriberTools } from "./tools";

type ButtondownPluginConfigSchema = z.ZodObject<{
  apiKey: z.ZodOptional<z.ZodString>;
  doubleOptIn: z.ZodDefault<z.ZodBoolean>;
  autoSendOnPublish: z.ZodDefault<z.ZodBoolean>;
}>;

export const buttondownConfigSchema: ButtondownPluginConfigSchema = z.object({
  apiKey: z.string().optional().describe("Buttondown API key"),
  doubleOptIn: z
    .boolean()
    .default(true)
    .describe("Require email confirmation for new subscribers"),
  autoSendOnPublish: z
    .boolean()
    .default(false)
    .describe("Automatically send newsletter when a blog post is published"),
});

export type ButtondownPluginConfig = z.output<typeof buttondownConfigSchema>;
export type ButtondownPluginConfigInput = z.input<
  typeof buttondownConfigSchema
>;

/** The signup form's route, public and backed by newsletter_signup. */
export const subscribeRoute: ApiRouteDefinition = {
  path: "/subscribe",
  method: "POST",
  tool: "newsletter_signup",
  public: true,
  successRedirect: "/subscribe/thanks",
  errorRedirect: "/subscribe/error",
};

/** What the service holds once set up: no provider without an API key. */
interface ButtondownState {
  readonly provider: ButtondownNewsletterProvider | undefined;
}

/**
 * Buttondown newsletter delivery and subscriber integration: with an API
 * key, it publishes newsletters, offers the subscriber tools and the
 * signup route, and adds the signup form to the site's footer.
 */
export function createButtondownPackage(
  deps: ButtondownClientDeps = {},
): ServicePackageDefinition<typeof buttondownConfigSchema> {
  const service = defineServicePlugin({
    id: "buttondown",
    config: buttondownConfigSchema,
    setup: (context): ButtondownState => {
      const { config } = context;
      if (!config.apiKey) return { provider: undefined };
      const runtime = serviceRuntime(context);
      const provider = new ButtondownNewsletterProvider(
        { apiKey: config.apiKey, doubleOptIn: config.doubleOptIn },
        runtime.logger,
        deps,
      );
      registerNewsletterProvider(runtime, provider, {
        // The id the package installs under, which the slot names.
        pluginId: runtime.pluginId,
        signupAction: `/api/${runtime.pluginId}/subscribe`,
        signupSuccessMessage: config.doubleOptIn
          ? "Check your email to confirm your subscription."
          : "You are subscribed.",
        autoSendOnPublish: config.autoSendOnPublish,
      });
      return { provider };
    },
  });
  return withApiRoutes(
    withTools<typeof buttondownConfigSchema, ButtondownState>(
      service,
      ({ state }) =>
        state.provider ? createNewsletterSubscriberTools(state.provider) : [],
    ),
    ({ config }) => (config.apiKey ? [subscribeRoute] : []),
  );
}
