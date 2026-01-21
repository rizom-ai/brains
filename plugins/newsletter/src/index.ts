import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { newsletterConfigSchema, type NewsletterConfig } from "./config";
import { createNewsletterTools } from "./tools";
import {
  handlePublishCompleted,
  type PublishCompletedPayload,
} from "./handlers/publish-handler";
import packageJson from "../package.json";

/**
 * Newsletter plugin for managing subscribers and sending newsletters via Buttondown
 *
 * Features:
 * - Subscribe/unsubscribe management via Buttondown API
 * - Newsletter creation and sending
 * - Integration with blog posts for content generation
 */
export class NewsletterPlugin extends ServicePlugin<NewsletterConfig> {
  constructor(config: Partial<NewsletterConfig> = {}) {
    super("newsletter", packageJson, config, newsletterConfigSchema);
  }

  /**
   * Register plugin components
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Subscribe to publish:completed for auto-send feature
    if (this.config.autoSendOnPublish && this.config.buttondown) {
      const buttondownConfig = this.config.buttondown;

      context.messaging.subscribe<
        PublishCompletedPayload,
        { success: boolean }
      >("publish:completed", async (msg) => {
        const result = await handlePublishCompleted(
          msg.payload,
          buttondownConfig,
          context.entityService,
          this.logger,
        );

        if (!result.success) {
          this.logger.warn("Auto-send newsletter failed", {
            error: result.error,
          });
        }

        return { success: true };
      });

      this.logger.info("Newsletter auto-send on publish enabled");
    }

    this.logger.debug("Newsletter plugin registered");
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      return [];
    }
    return createNewsletterTools(this.id, this.context, this.config.buttondown);
  }
}

/**
 * Create a newsletter plugin instance
 */
export function createNewsletterPlugin(
  config: Partial<NewsletterConfig> = {},
): Plugin {
  return new NewsletterPlugin(config);
}

// Export types and schemas
export type { NewsletterConfig, ButtondownConfig } from "./config";
export { newsletterConfigSchema, buttondownConfigSchema } from "./config";

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

export type {
  Subscriber,
  SubscriberType,
  CreateSubscriberInput,
  ButtondownEmail,
  EmailStatus,
  CreateEmailInput,
} from "./lib/buttondown-client";
export { ButtondownClient } from "./lib/buttondown-client";
