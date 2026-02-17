import type {
  Plugin,
  ServicePluginContext,
  PluginTool,
  ApiRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z, type PublishProvider, type PublishResult } from "@brains/utils";
import { h } from "preact";
import { NewsletterSignup } from "@brains/ui-library";
import { newsletterConfigSchema, type NewsletterConfig } from "./config";
import { createNewsletterTools } from "./tools";
import {
  handlePublishCompleted,
  type PublishCompletedPayload,
} from "./handlers/publish-handler";
import { GenerationJobHandler } from "./handlers/generation-handler";
import { generationTemplate } from "./templates/generation-template";
import { newsletterListTemplate } from "./templates/newsletter-list";
import { newsletterDetailTemplate } from "./templates/newsletter-detail";
import { NewsletterDataSource } from "./datasources/newsletter-datasource";
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

    // Register newsletter datasource
    const newsletterDataSource = new NewsletterDataSource(
      this.logger.child("NewsletterDataSource"),
    );
    context.entities.registerDataSource(newsletterDataSource);

    // Register templates (AI generation + view templates)
    context.templates.register({
      generation: generationTemplate,
      "newsletter-list": newsletterListTemplate,
      "newsletter-detail": newsletterDetailTemplate,
    });

    // Register with publish-pipeline for both direct and queued publishing
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);
    this.subscribeToGenerateExecute(context);

    // Register slot for newsletter signup form when all plugins are ready
    // This ensures site-builder has subscribed to the slot:register channel
    if (this.config.buttondown) {
      context.messaging.subscribe("system:plugins:ready", async () => {
        await context.messaging.send("plugin:site-builder:slot:register", {
          pluginId: this.id,
          slotName: "footer-top",
          render: () => h(NewsletterSignup, { variant: "inline" }),
        });
        return { success: true };
      });
    }

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

    // Register newsletter generation job handler
    context.jobs.registerHandler(
      "newsletter-generation",
      new GenerationJobHandler(this.logger, context, this.config),
    );

    // Register eval handlers for AI testing
    this.registerEvalHandlers(context);

    this.logger.debug("Newsletter plugin registered");
  }

  /**
   * Register eval handlers for plugin testing
   */
  private registerEvalHandlers(context: ServicePluginContext): void {
    // Single unified generation handler (matches social-media pattern)
    const generationInputSchema = z.object({
      prompt: z.string().optional(),
      content: z.string().optional(),
    });

    context.eval.registerHandler("generation", async (input: unknown) => {
      const parsed = generationInputSchema.parse(input);

      const generationPrompt = parsed.content
        ? `Create an engaging newsletter based on this content:\n\n${parsed.content}`
        : (parsed.prompt ?? "Write an engaging newsletter");

      return context.ai.generate<{
        subject: string;
        content: string;
      }>({
        prompt: generationPrompt,
        templateName: "newsletter:generation",
      });
    });
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
   * Get API routes for webserver
   * Exposes /api/newsletter/subscribe for form submissions
   */
  override getApiRoutes(): ApiRouteDefinition[] {
    if (!this.config.buttondown?.apiKey) {
      return [];
    }

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
              status: "about_to_send", // Send immediately
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

        // Skip already published newsletters
        if (newsletter.metadata.status === "published") {
          this.logger.debug(`Newsletter already published: ${entityId}`);
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
            status: "about_to_send", // Triggers immediate send
          });
          buttondownId = email.id;
        }

        // Update entity
        await context.entityService.updateEntity({
          ...newsletter,
          metadata: {
            ...newsletter.metadata,
            status: "published",
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

  /**
   * Subscribe to generate:execute messages for newsletter entities
   * Triggered by content-pipeline scheduler based on generation schedule
   */
  private subscribeToGenerateExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      "generate:execute",
      async (msg) => {
        const { entityType } = msg.payload;

        // Only handle newsletter entities
        if (entityType !== "newsletter") {
          return { success: true };
        }

        this.logger.info("Received generate:execute for newsletter");

        try {
          // Fetch recent posts to include in the newsletter
          const recentPosts = await context.entityService.listEntities("post", {
            filter: { metadata: { status: "published" } },
            limit: 10,
          });

          if (recentPosts.length === 0) {
            this.logger.info(
              "No published posts found for newsletter generation",
            );
            await context.messaging.send("generate:report:failure", {
              entityType: "newsletter",
              error: "No published posts available for newsletter",
            });
            return { success: true };
          }

          // Queue newsletter generation job with source posts
          const jobId = await context.jobs.enqueue(
            "newsletter-generation",
            {
              sourceEntityIds: recentPosts.map((p) => p.id),
              sourceEntityType: "post",
              addToQueue: false, // Create as draft for review
            },
            { interfaceType: "job", userId: "system" },
          );

          this.logger.info("Newsletter generation job queued", { jobId });

          return { success: true };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error("Failed to handle generate:execute:", {
            error: errorMessage,
          });
          await context.messaging.send("generate:report:failure", {
            entityType: "newsletter",
            error: errorMessage,
          });
          return { success: true };
        }
      },
    );
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
