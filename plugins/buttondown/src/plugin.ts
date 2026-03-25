import type {
  PluginTool,
  ServicePluginContext,
  ApiRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";
import { ButtondownClient } from "./lib/buttondown-client";
import { createButtondownTools } from "./tools";
import {
  handlePublishCompleted,
  type PublishCompletedPayload,
} from "./publish-handler";
import packageJson from "../package.json";

const buttondownConfigSchema = z.object({
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

type ButtondownConfig = z.infer<typeof buttondownConfigSchema>;

/**
 * Buttondown integration plugin — subscriber management and API routes.
 * Newsletter entity management is in entities/newsletter.
 */
export class ButtondownPlugin extends ServicePlugin<ButtondownConfig> {
  constructor(config: Partial<ButtondownConfig> = {}) {
    super("buttondown", packageJson, config, buttondownConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Respond to "are you configured?" messages from newsletter entity plugin
    context.messaging.subscribe("buttondown:is-configured", async () => {
      return { success: !!this.config.apiKey };
    });

    // Handle "buttondown:send" messages from newsletter publish pipeline
    if (this.config.apiKey) {
      const client = new ButtondownClient(
        { apiKey: this.config.apiKey, doubleOptIn: this.config.doubleOptIn },
        this.logger,
      );

      context.messaging.subscribe<
        { entityId: string; subject: string; content: string },
        { emailId?: string }
      >("buttondown:send", async (msg) => {
        try {
          const email = await client.createEmail({
            subject: msg.payload.subject,
            body: msg.payload.content,
            status: "about_to_send",
          });
          return { success: true, data: { emailId: email.id } };
        } catch (error) {
          this.logger.error("Buttondown send failed", {
            error: getErrorMessage(error),
          });
          return { success: false };
        }
      });

      // Auto-send newsletter on blog publish
      if (this.config.autoSendOnPublish) {
        context.messaging.subscribe<
          PublishCompletedPayload,
          { success: boolean }
        >("publish:completed", async (msg) => {
          await handlePublishCompleted(
            msg.payload,
            client,
            context.entityService,
            this.logger,
          );
          return { success: true };
        });
        this.logger.info("Buttondown auto-send on publish enabled");
      }
    }
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.config.apiKey) return [];
    return createButtondownTools(
      this.id,
      { apiKey: this.config.apiKey, doubleOptIn: this.config.doubleOptIn },
      this.logger,
    );
  }

  override getApiRoutes(): ApiRouteDefinition[] {
    if (!this.config.apiKey) return [];
    return [
      {
        path: "/subscribe",
        method: "POST",
        tool: "subscribe",
        public: true,
        successRedirect: "/subscribe/thanks",
        errorRedirect: "/subscribe/error",
      },
    ];
  }
}

export function buttondownPlugin(
  config: Partial<ButtondownConfig> = {},
): ButtondownPlugin {
  return new ButtondownPlugin(config);
}
