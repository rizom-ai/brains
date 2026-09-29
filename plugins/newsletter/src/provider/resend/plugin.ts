import type {
  ApiRouteDefinition,
  ServicePluginContext,
  Tool,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../../../package.json";
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

const resendConfigSchema: ResendPluginConfigSchema = z.object({
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

/** Resend newsletter delivery and subscriber integration. */
export class ResendPlugin extends ServicePlugin<
  ResendPluginConfig,
  ResendPluginConfigInput
> {
  private readonly deps: ResendClientDeps;

  constructor(
    config: ResendPluginConfigInput = {},
    deps: ResendClientDeps = {},
  ) {
    super("resend", packageJson, config, resendConfigSchema);
    this.deps = deps;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    const provider = this.createProvider();
    if (!provider) return;

    registerNewsletterProvider(
      context,
      provider,
      {
        pluginId: this.id,
        publishResultIdField: "resendBroadcastId",
        signupAction: "/api/resend/subscribe",
        signupSuccessMessage: "You are subscribed.",
        autoSendOnPublish: this.config.autoSendOnPublish,
      },
      this.logger,
    );
  }

  protected override async getTools(): Promise<Tool[]> {
    const provider = this.createProvider();
    return provider ? createNewsletterSubscriberTools(provider) : [];
  }

  override getApiRoutes(): ApiRouteDefinition[] {
    if (!this.isConfigured()) return [];
    return [
      {
        path: "/subscribe",
        method: "POST",
        tool: "newsletter_signup",
        public: true,
        successRedirect: "/subscribe/thanks",
        errorRedirect: "/subscribe/error",
      },
    ];
  }

  private isConfigured(): boolean {
    return Boolean(
      this.config.apiKey && this.config.segmentId && this.config.from,
    );
  }

  private createProvider(): ResendNewsletterProvider | undefined {
    const { apiKey, segmentId, from, replyTo, topicId } = this.config;
    if (!apiKey || !segmentId || !from) return undefined;
    return new ResendNewsletterProvider(
      {
        apiKey,
        segmentId,
        from,
        ...(replyTo ? { replyTo } : {}),
        ...(topicId ? { topicId } : {}),
      },
      this.logger,
      this.deps,
    );
  }
}

export function resendPlugin(
  config: ResendPluginConfigInput = {},
): ResendPlugin {
  return new ResendPlugin(config);
}
