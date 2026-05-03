import type {
  Plugin,
  EntityPluginContext,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { getErrorMessage, z, type PublishProvider } from "@brains/utils";
import { h } from "preact";
import { NewsletterSignup } from "@brains/ui-library";
import { newsletterSchema, type Newsletter } from "./schemas/newsletter";
import { newsletterAdapter } from "./adapters/newsletter-adapter";
import { NewsletterDataSource } from "./datasources/newsletter-datasource";
import { GenerationJobHandler } from "./handlers/generation-handler";
import { generationTemplate } from "./templates/generation-template";
import { newsletterListTemplate } from "./templates/newsletter-list";
import { newsletterDetailTemplate } from "./templates/newsletter-detail";
import packageJson from "../package.json";

const newsletterConfigSchema = z.object({});
type NewsletterConfig = z.infer<typeof newsletterConfigSchema>;

/**
 * Newsletter EntityPlugin — manages newsletter entities with AI generation.
 *
 * Zero tools. Newsletter CRUD goes through system_create/update/delete.
 * Subscriber management (subscribe, unsubscribe) is in plugins/buttondown.
 */
export class NewsletterPlugin extends EntityPlugin<
  Newsletter,
  NewsletterConfig
> {
  readonly entityType = "newsletter";
  readonly schema = newsletterSchema;
  readonly adapter = newsletterAdapter;

  constructor(config: Partial<NewsletterConfig> = {}) {
    super("newsletter", packageJson, config, newsletterConfigSchema);
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler {
    return new GenerationJobHandler(this.logger, context);
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      generation: generationTemplate,
      "newsletter-list": newsletterListTemplate,
      "newsletter-detail": newsletterDetailTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [
      new NewsletterDataSource(this.logger.child("NewsletterDataSource")),
    ];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Publish pipeline registration (deferred to system:plugins:ready)
    this.deferPublishRegistration(context);

    // Publish execute handler
    this.subscribeToPublishExecute(context);

    // Generate execute handler (from content-pipeline)
    this.subscribeToGenerateExecute(context);

    // Register eval handlers
    this.registerEvalHandlers(context);

    // Newsletter signup slot (if buttondown plugin is loaded, it provides the config)
    context.messaging.subscribe("system:plugins:ready", async () => {
      // Check if buttondown is configured by sending a message
      const response = await context.messaging.send({
        type: "buttondown:is-configured",
        payload: {},
      });
      if (!("noop" in response) && response.success) {
        await context.messaging.send({
          type: "plugin:site-builder:slot:register",
          payload: {
            pluginId: this.id,
            slotName: "footer-top",
            render: () => h(NewsletterSignup, { variant: "inline" }),
          },
        });
      }
      return { success: true };
    });

    this.logger.debug("Newsletter plugin registered");
  }

  private deferPublishRegistration(context: EntityPluginContext): void {
    const provider: PublishProvider = {
      name: "internal",
      publish: async () => ({ id: "internal" }),
    };

    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send({
        type: "publish:register",
        payload: {
          entityType: "newsletter",
          provider,
        },
      });
      return { success: true };
    });
  }

  private subscribeToPublishExecute(context: EntityPluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;
      if (entityType !== "newsletter") return { success: true };

      try {
        const newsletter = await context.entityService.getEntity<Newsletter>(
          "newsletter",
          entityId,
        );
        if (!newsletter) {
          await context.messaging.send({
            type: "publish:report:failure",
            payload: {
              entityType,
              entityId,
              error: `Newsletter not found: ${entityId}`,
            },
          });
          return { success: true };
        }

        if (newsletter.metadata.status === "published") {
          return { success: true };
        }

        // Send to buttondown if available
        const sendResult = await context.messaging.send<
          { entityId: string; subject: string; content: string },
          { emailId?: string }
        >({
          type: "buttondown:send",
          payload: {
            entityId,
            subject: newsletter.metadata.subject,
            content: newsletter.content,
          },
        });

        const sentAt = new Date().toISOString();
        const buttondownId =
          !("noop" in sendResult) && sendResult.data
            ? sendResult.data.emailId
            : undefined;

        await context.entityService.updateEntity({
          ...newsletter,
          metadata: {
            ...newsletter.metadata,
            status: "published",
            sentAt,
            buttondownId,
          },
        });

        await context.messaging.send({
          type: "publish:report:success",
          payload: {
            entityType,
            entityId,
            sentAt,
          },
        });

        this.logger.info(`Published newsletter: ${entityId}`);
        return { success: true };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        await context.messaging.send({
          type: "publish:report:failure",
          payload: {
            entityType,
            entityId,
            error: errorMessage,
          },
        });
        return { success: true };
      }
    });
  }

  private subscribeToGenerateExecute(context: EntityPluginContext): void {
    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      "generate:execute",
      async (msg) => {
        if (msg.payload.entityType !== "newsletter") return { success: true };

        try {
          const recentPosts = await context.entityService.listEntities("post", {
            filter: { metadata: { status: "published" } },
            limit: 10,
          });

          if (recentPosts.length === 0) {
            await context.messaging.send({
              type: "generate:report:failure",
              payload: {
                entityType: "newsletter",
                error: "No published posts available for newsletter",
              },
            });
            return { success: true };
          }

          await context.jobs.enqueue({
            type: "newsletter:generation",
            data: {
              sourceEntityIds: recentPosts.map((p) => p.id),
              sourceEntityType: "post",
              addToQueue: false,
            },
            toolContext: { interfaceType: "job", userId: "system" },
          });

          return { success: true };
        } catch (error) {
          await context.messaging.send({
            type: "generate:report:failure",
            payload: {
              entityType: "newsletter",
              error: getErrorMessage(error),
            },
          });
          return { success: true };
        }
      },
    );
  }

  private registerEvalHandlers(context: EntityPluginContext): void {
    const generationInputSchema = z.object({
      prompt: z.string().optional(),
      content: z.string().optional(),
    });

    context.eval.registerHandler("generation", async (input: unknown) => {
      const parsed = generationInputSchema.parse(input);
      const generationPrompt = parsed.content
        ? `Create an engaging newsletter based on this content:\n\n${parsed.content}`
        : (parsed.prompt ?? "Write an engaging newsletter");

      return context.ai.generate<{ subject: string; content: string }>({
        prompt: generationPrompt,
        templateName: "newsletter:generation",
      });
    });
  }
}

export function newsletterPlugin(
  config: Partial<NewsletterConfig> = {},
): Plugin {
  return new NewsletterPlugin(config);
}
