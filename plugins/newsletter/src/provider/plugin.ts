import type {
  Tool,
  ServicePluginContext,
  ApiRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../../package.json";
import { ButtondownNewsletterProvider } from "./buttondown-provider";
import type { ButtondownClientDeps } from "./lib/buttondown-client";
import { registerNewsletterProvider } from "./register-provider";
import { createNewsletterSubscriberTools } from "./tools";

type ButtondownPluginConfigSchema = z.ZodObject<{
  apiKey: z.ZodOptional<z.ZodString>;
  doubleOptIn: z.ZodDefault<z.ZodBoolean>;
  autoSendOnPublish: z.ZodDefault<z.ZodBoolean>;
}>;

const buttondownConfigSchema: ButtondownPluginConfigSchema = z.object({
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

/** Buttondown newsletter delivery and subscriber integration. */
export class ButtondownPlugin extends ServicePlugin<
  ButtondownPluginConfig,
  ButtondownPluginConfigInput
> {
  private readonly deps: ButtondownClientDeps;

  constructor(
    config: ButtondownPluginConfigInput = {},
    deps: ButtondownClientDeps = {},
  ) {
    super("buttondown", packageJson, config, buttondownConfigSchema);
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
        publishResultIdField: "buttondownId",
        signupAction: "/api/buttondown/subscribe",
        signupSuccessMessage: this.config.doubleOptIn
          ? "Check your email to confirm your subscription."
          : "You are subscribed.",
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
    if (!this.config.apiKey) return [];
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

  private createProvider(): ButtondownNewsletterProvider | undefined {
    if (!this.config.apiKey) return undefined;
    return new ButtondownNewsletterProvider(
      {
        apiKey: this.config.apiKey,
        doubleOptIn: this.config.doubleOptIn,
      },
      this.logger,
      this.deps,
    );
  }
}

export function buttondownPlugin(
  config: ButtondownPluginConfigInput = {},
): ButtondownPlugin {
  return new ButtondownPlugin(config);
}
