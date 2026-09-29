import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { GENERATE_CHANNELS, NEWSLETTER_CHANNELS } from "@brains/contracts";
import { fetchVoiceGuidance } from "@brains/contracts";
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
import packageJson from "../../package.json";

const newsletterConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$loose
> = z.looseObject({});

type NewsletterConfig = z.output<typeof newsletterConfigSchema>;
type NewsletterConfigInput = z.input<typeof newsletterConfigSchema>;

const generationEvalInputSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  content: z.ZodOptional<z.ZodString>;
}> = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
});

type GenerationEvalInput = z.output<typeof generationEvalInputSchema>;

/**
 * Newsletter EntityPlugin — manages newsletter entities with AI generation.
 *
 * Zero tools. Newsletter CRUD goes through system_create/update/delete.
 * Subscriber management (subscribe, unsubscribe) is in the provider service.
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
      projectionSourceRole: "secondary",
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
    // Generate execute handler (from content-pipeline)
    this.subscribeToGenerateExecute(context);

    // Register eval handlers
    this.registerEvalHandlers(context);

    this.logger.debug("Newsletter plugin registered");
  }

  private subscribeToGenerateExecute(context: EntityPluginContext): void {
    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      GENERATE_CHANNELS.execute,
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
              type: GENERATE_CHANNELS.reportFailure,
              payload: {
                entityType: "newsletter",
                error: "No published posts available for newsletter",
              },
            });
            return { success: true };
          }

          await context.jobs.enqueue({
            type: NEWSLETTER_CHANNELS.generation,
            data: {
              sourceEntityIds: recentPosts.map((p) => p.id),
              sourceEntityType: "post",
              addToQueue: false,
            },
            toolContext: {
              interfaceType: "job",
              actor: {
                kind: "service",
                serviceId: "newsletter-generation",
              },
            },
          });

          return { success: true };
        } catch (error) {
          await context.messaging.send({
            type: GENERATE_CHANNELS.reportFailure,
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

      const voiceGuidance = await fetchVoiceGuidance(context.entityService);
      return context.ai.generate(
        {
          prompt: generationPrompt,
          templateName: NEWSLETTER_CHANNELS.generation,
          representedIdentity: "anchor",
          ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
        },
        z.object({ subject: z.string(), content: z.string() }),
      );
    });
  }
}

export function newsletterPlugin(config: NewsletterConfigInput = {}): Plugin {
  return new NewsletterPlugin(config);
}
