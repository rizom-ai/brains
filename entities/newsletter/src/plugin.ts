import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import type { PublishProvider } from "@brains/contracts";
import { h } from "preact";
import { NewsletterSignup } from "@brains/ui-library";
import { newsletterSchema, type Newsletter } from "./schemas/newsletter";
import {
  newsletterAdapter,
  type NewsletterAdapter,
} from "./adapters/newsletter-adapter";
import { NewsletterDataSource } from "./datasources/newsletter-datasource";
import { GenerationJobHandler } from "./handlers/generation-handler";
import { generationTemplate } from "./templates/generation-template";
import { newsletterListTemplate } from "./templates/newsletter-list";
import { newsletterDetailTemplate } from "./templates/newsletter-detail";
import packageJson from "../package.json";

type NewsletterConfig = Record<string, unknown>;
type NewsletterConfigInput = Record<string, unknown>;

const newsletterConfigSchema: z.ZodType<
  NewsletterConfig,
  NewsletterConfigInput
> = z.looseObject({});

interface GenerationEvalInput {
  prompt?: string | undefined;
  content?: string | undefined;
}

const generationEvalInputSchema: z.ZodType<GenerationEvalInput> = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
});

/**
 * Newsletter EntityPlugin — manages newsletter entities with AI generation.
 *
 * Zero tools. Newsletter CRUD goes through system_create/update/delete.
 * Subscriber management (subscribe, unsubscribe) is in plugins/buttondown.
 */
export class NewsletterPlugin extends EntityPlugin<
  Newsletter,
  NewsletterConfig,
  NewsletterConfigInput
> {
  readonly entityType = "newsletter" as const;
  readonly schema: typeof newsletterSchema = newsletterSchema;
  readonly adapter: NewsletterAdapter = newsletterAdapter;

  constructor(config: NewsletterConfigInput = {}) {
    super("newsletter", packageJson, config, newsletterConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return {
      publish: { publishStatuses: ["queued", "published", "failed"] },
    };
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
      publish: async (content, metadata) => {
        const subject =
          typeof metadata["subject"] === "string" ? metadata["subject"] : "";
        const sendResult = await context.messaging.send<
          { entityId: string; subject: string; content: string },
          { emailId?: string }
        >({
          type: "buttondown:send",
          payload: {
            entityId: "",
            subject,
            content,
          },
        });

        const buttondownId =
          !("noop" in sendResult) && sendResult.data?.emailId
            ? sendResult.data.emailId
            : "internal";
        return { id: buttondownId };
      },
    };

    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send({
        type: "publish:register",
        payload: {
          entityType: "newsletter",
          provider,
          config: {
            publishResultIdField: "buttondownId",
            publishTimestampField: "sentAt",
          },
        },
      });
      return { success: true };
    });
  }

  private subscribeToGenerateExecute(context: EntityPluginContext): void {
    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      "generate:execute",
      async (msg) => {
        if (msg.payload.entityType !== "newsletter") return { success: true };

        try {
          const recentPosts = await context.entityService.listEntities({
            entityType: "post",
            options: {
              filter: { metadata: { status: "published" } },
              limit: 10,
            },
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
    context.eval.registerHandler("generation", async (input: unknown) => {
      const parsed: GenerationEvalInput =
        generationEvalInputSchema.parse(input);
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

export function newsletterPlugin(config: NewsletterConfigInput = {}): Plugin {
  return new NewsletterPlugin(config);
}
