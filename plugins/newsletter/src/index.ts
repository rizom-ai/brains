import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import type { PublishProvider, PublishResult } from "@brains/utils";
import { newsletterConfigSchema, type NewsletterConfig } from "./config";
import { createNewsletterTools } from "./tools";
import {
  handlePublishCompleted,
  type PublishCompletedPayload,
} from "./handlers/publish-handler";
import { newsletterSchema, type Newsletter } from "./schemas/newsletter";
import { newsletterAdapter } from "./adapters/newsletter-adapter";
import { ButtondownClient } from "./lib/buttondown-client";
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
    // Register newsletter entity type
    context.entities.register(
      "newsletter",
      newsletterSchema,
      newsletterAdapter,
    );

    // Register with publish-pipeline for both direct and queued publishing
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);

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

  /**
   * Register with publish-pipeline
   * Uses Buttondown provider if configured, otherwise internal provider
   */
  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    const provider: PublishProvider = this.config.buttondown
      ? {
          name: "buttondown",
          publish: async (
            content: string,
            metadata: Record<string, unknown>,
          ): Promise<PublishResult> => {
            // buttondown config is guaranteed to exist here due to the ternary
            const buttondownConfig = this.config.buttondown;
            if (!buttondownConfig) {
              throw new Error("Buttondown config not available");
            }
            const client = new ButtondownClient(buttondownConfig, this.logger);
            const email = await client.createEmail({
              subject: (metadata["subject"] as string) || "Newsletter",
              body: content,
              status: "sent", // Send immediately
            });
            return { id: email.id };
          },
        }
      : {
          name: "internal",
          publish: async (): Promise<PublishResult> => {
            return { id: "internal" };
          },
        };

    await context.messaging.send("publish:register", {
      entityType: "newsletter",
      provider,
    });
  }

  /**
   * Subscribe to publish:execute messages for newsletter entities
   */
  private subscribeToPublishExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;

      // Only handle newsletter entities
      if (entityType !== "newsletter") {
        return { success: true };
      }

      try {
        const newsletter = await context.entityService.getEntity<Newsletter>(
          "newsletter",
          entityId,
        );

        if (!newsletter) {
          await context.messaging.send("publish:report:failure", {
            entityType,
            entityId,
            error: `Newsletter not found: ${entityId}`,
          });
          return { success: true };
        }

        // Skip already sent newsletters
        if (newsletter.metadata.status === "sent") {
          this.logger.debug(`Newsletter already sent: ${entityId}`);
          return { success: true };
        }

        const sentAt = new Date().toISOString();
        let buttondownId: string | undefined;

        // Send via Buttondown if configured
        if (this.config.buttondown) {
          const client = new ButtondownClient(
            this.config.buttondown,
            this.logger,
          );
          const email = await client.createEmail({
            subject: newsletter.metadata.subject,
            body: newsletter.content,
            status: "sent",
          });
          buttondownId = email.id;
        }

        // Update entity
        await context.entityService.updateEntity({
          ...newsletter,
          metadata: {
            ...newsletter.metadata,
            status: "sent",
            sentAt,
            buttondownId,
          },
        });

        // Report success
        await context.messaging.send("publish:report:success", {
          entityType,
          entityId,
          sentAt,
        });

        this.logger.info(`Published newsletter: ${entityId}`);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await context.messaging.send("publish:report:failure", {
          entityType,
          entityId,
          error: errorMessage,
        });
        this.logger.error(`Failed to publish newsletter ${entityId}:`, {
          error: errorMessage,
        });
        return { success: true };
      }
    });
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
