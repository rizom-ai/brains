import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  withApiRoutes,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { subscribeRoute } from "../plugin";
import { registerNewsletterProvider } from "../register-provider";
import { createNewsletterSubscriberTools } from "../tools";
import type { ResendClientDeps } from "./resend-client";
import { ResendNewsletterProvider } from "./resend-provider";

type ResendPluginConfigSchema = z.ZodObject<{
  apiKey: z.ZodOptional<z.ZodString>;
  segmentId: z.ZodOptional<z.ZodString>;
  from: z.ZodOptional<z.ZodString>;
  replyTo: z.ZodOptional<z.ZodString>;
  topicId: z.ZodOptional<z.ZodString>;
  autoSendOnPublish: z.ZodDefault<z.ZodBoolean>;
}>;

const optionalNonEmptyString: z.ZodOptional<z.ZodString> = z
  .string()
  .trim()
  .min(1)
  .optional();

export const resendConfigSchema: ResendPluginConfigSchema = z.object({
  apiKey: optionalNonEmptyString.describe("Resend API key"),
  segmentId: optionalNonEmptyString.describe("Resend newsletter Segment ID"),
  from: optionalNonEmptyString.describe("Verified Resend sender"),
  replyTo: optionalNonEmptyString.describe("Optional reply-to address"),
  topicId: optionalNonEmptyString.describe("Optional Resend Topic ID"),
  autoSendOnPublish: z
    .boolean()
    .default(false)
    .describe("Automatically send newsletter when a blog post is published"),
});

export type ResendPluginConfig = z.output<typeof resendConfigSchema>;
export type ResendPluginConfigInput = z.input<typeof resendConfigSchema>;

/** Whether the config names everything a Resend broadcast needs. */
function isConfigured(config: ResendPluginConfig): boolean {
  return Boolean(config.apiKey && config.segmentId && config.from);
}

/** What the service holds once set up: no provider until it is configured. */
interface ResendState {
  readonly provider: ResendNewsletterProvider | undefined;
}

/**
 * Resend newsletter delivery and subscriber integration: with an API key,
 * a Segment and a sender, it publishes newsletters, offers the subscriber
 * tools and the signup route, and adds the signup form to the site's
 * footer.
 */
export function createResendPackage(
  deps: ResendClientDeps = {},
): ServicePackageDefinition<typeof resendConfigSchema> {
  const service = defineServicePlugin({
    id: "resend",
    config: resendConfigSchema,
    setup: (context): ResendState => {
      const { apiKey, segmentId, from, replyTo, topicId, autoSendOnPublish } =
        context.config;
      if (!apiKey || !segmentId || !from) return { provider: undefined };
      const runtime = serviceRuntime(context);
      const provider = new ResendNewsletterProvider(
        {
          apiKey,
          segmentId,
          from,
          ...(replyTo ? { replyTo } : {}),
          ...(topicId ? { topicId } : {}),
        },
        runtime.logger,
        deps,
      );
      registerNewsletterProvider(runtime, provider, {
        pluginId: runtime.pluginId,
        signupAction: `/api/${runtime.pluginId}/subscribe`,
        signupSuccessMessage: "You are subscribed.",
        autoSendOnPublish,
      });
      return { provider };
    },
  });
  return withApiRoutes(
    withTools<typeof resendConfigSchema, ResendState>(service, ({ state }) =>
      state.provider ? createNewsletterSubscriberTools(state.provider) : [],
    ),
    ({ config }) => (isConfigured(config) ? [subscribeRoute] : []),
  );
}
