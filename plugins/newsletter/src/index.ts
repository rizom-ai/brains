import type {
  ServicePluginContext,
  PluginTool,
  ApiRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import {
  getErrorMessage,
  z,
  type PublishProvider,
  type PublishResult,
} from "@brains/utils";
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

export class NewsletterPlugin extends ServicePlugin<NewsletterConfig> {
  constructor(config: Partial<NewsletterConfig> = {}) {
    super("newsletter", packageJson, config, newsletterConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.register(
      "newsletter",
      newsletterSchema,
      newsletterAdapter,
    );

    const newsletterDataSource = new NewsletterDataSource(
      this.logger.child("NewsletterDataSource"),
    );
    context.entities.registerDataSource(newsletterDataSource);

    context.templates.register({
      generation: generationTemplate,
      "newsletter-list": newsletterListTemplate,
      "newsletter-detail": newsletterDetailTemplate,
    });

    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);
    this.subscribeToGenerateExecute(context);

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

    context.jobs.registerHandler(
      "newsletter-generation",
      new GenerationJobHandler(this.logger, context, this.config),
    );

    this.registerEvalHandlers(context);

    this.logger.debug("Newsletter plugin registered");
  }

  private registerEvalHandlers(context: ServicePluginContext): void {
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

  protected override async getTools(): Promise<PluginTool[]> {
    return createNewsletterTools(
      this.id,
      this.getContext(),
      this.config.buttondown,
    );
  }

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

  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    const { buttondown } = this.config;
    const provider: PublishProvider = buttondown
      ? {
          name: "buttondown",
          publish: async (
            content: string,
            metadata: Record<string, unknown>,
          ): Promise<PublishResult> => {
            const client = new ButtondownClient(buttondown, this.logger);
            const email = await client.createEmail({
              subject: (metadata["subject"] as string) || "Newsletter",
              body: content,
              status: "about_to_send",
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

  private subscribeToPublishExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;

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

        if (newsletter.metadata.status === "published") {
          this.logger.debug(`Newsletter already published: ${entityId}`);
          return { success: true };
        }

        const sentAt = new Date().toISOString();
        let buttondownId: string | undefined;

        if (this.config.buttondown) {
          const client = new ButtondownClient(
            this.config.buttondown,
            this.logger,
          );
          const email = await client.createEmail({
            subject: newsletter.metadata.subject,
            body: newsletter.content,
            status: "about_to_send",
          });
          buttondownId = email.id;
        }

        await context.entityService.updateEntity({
          ...newsletter,
          metadata: {
            ...newsletter.metadata,
            status: "published",
            sentAt,
            buttondownId,
          },
        });

        await context.messaging.send("publish:report:success", {
          entityType,
          entityId,
          sentAt,
        });

        this.logger.info(`Published newsletter: ${entityId}`);
        return { success: true };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
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

  private subscribeToGenerateExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      "generate:execute",
      async (msg) => {
        const { entityType } = msg.payload;

        if (entityType !== "newsletter") {
          return { success: true };
        }

        this.logger.info("Received generate:execute for newsletter");

        try {
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

          const jobId = await context.jobs.enqueue(
            "newsletter-generation",
            {
              sourceEntityIds: recentPosts.map((p) => p.id),
              sourceEntityType: "post",
              addToQueue: false,
            },
            { interfaceType: "job", userId: "system" },
          );

          this.logger.info("Newsletter generation job queued", { jobId });

          return { success: true };
        } catch (error) {
          const errorMessage = getErrorMessage(error);
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

export function createNewsletterPlugin(
  config: Partial<NewsletterConfig> = {},
): NewsletterPlugin {
  return new NewsletterPlugin(config);
}

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
