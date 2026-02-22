import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { DeckFormatter } from "./formatters/deck-formatter";
import { deckTemplate } from "./templates/deck-template";
import { deckListTemplate } from "./templates/deck-list";
import { deckGenerationTemplate } from "./templates/generation-template";
import { deckDescriptionTemplate } from "./templates/description-template";
import { DeckDataSource } from "./datasources/deck-datasource";
import { DeckGenerationJobHandler } from "./handlers/deckGenerationJobHandler";
import { createDeckTools } from "./tools";
import type { DeckEntity } from "./schemas/deck";
import packageJson from "../package.json";

const decksConfigSchema = z.object({});

export class DecksPlugin extends ServicePlugin<Record<string, never>> {
  private pluginContext?: ServicePluginContext;
  private formatter = new DeckFormatter();

  constructor() {
    super("decks", packageJson, {}, decksConfigSchema);
  }

  override async onRegister(context: ServicePluginContext): Promise<void> {
    this.pluginContext = context;
    await super.onRegister(context);

    context.entities.register("deck", this.formatter.schema, this.formatter, {
      weight: 1.5,
    });

    context.entities.registerDataSource(new DeckDataSource(this.logger));

    context.templates.register({
      "deck-detail": deckTemplate,
      "deck-list": deckListTemplate,
      generation: deckGenerationTemplate,
      description: deckDescriptionTemplate,
    });

    context.jobs.registerHandler(
      "generation",
      new DeckGenerationJobHandler(
        this.logger.child("DeckGenerationJobHandler"),
        context,
      ),
    );

    this.registerEvalHandlers(context);
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);

    this.logger.info("Decks plugin registered successfully");
  }

  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    await context.messaging.send("publish:register", {
      entityType: "deck",
      provider: {
        name: "internal",
        publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
      },
    });

    this.logger.info("Registered deck with publish-pipeline");
  }

  private subscribeToPublishExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;

      if (entityType !== "deck") {
        return { success: true };
      }

      try {
        const deck = await context.entityService.getEntity<DeckEntity>(
          "deck",
          entityId,
        );

        if (!deck) {
          await context.messaging.send("publish:report:failure", {
            entityType,
            entityId,
            error: `Deck not found: ${entityId}`,
          });
          return { success: true };
        }

        if (deck.metadata.status === "published") {
          this.logger.debug(`Deck already published: ${entityId}`);
          return { success: true };
        }

        const publishedAt = new Date().toISOString();
        const updatedDeck: DeckEntity = {
          ...deck,
          status: "published",
          publishedAt,
          metadata: {
            ...deck.metadata,
            status: "published",
            publishedAt,
          },
        };

        await context.entityService.updateEntity({
          ...updatedDeck,
          content: this.formatter.toMarkdown(updatedDeck),
        });

        await context.messaging.send("publish:report:success", {
          entityType,
          entityId,
          result: { id: entityId },
        });

        this.logger.info(`Published deck: ${entityId}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await context.messaging.send("publish:report:failure", {
          entityType,
          entityId,
          error: errorMessage,
        });
        this.logger.error(`Failed to publish deck: ${errorMessage}`);
      }

      return { success: true };
    });

    this.logger.debug("Subscribed to publish:execute messages");
  }

  private registerEvalHandlers(context: ServicePluginContext): void {
    const generateDeckInputSchema = z.object({
      prompt: z.string(),
      event: z.string().optional(),
    });

    context.eval.registerHandler("generateDeck", async (input: unknown) => {
      const parsed = generateDeckInputSchema.parse(input);
      const generationPrompt = `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`;

      return context.ai.generate<{
        title: string;
        content: string;
        description: string;
      }>({
        prompt: generationPrompt,
        templateName: "decks:generation",
      });
    });

    const generateDescriptionInputSchema = z.object({
      title: z.string(),
      content: z.string(),
    });

    context.eval.registerHandler(
      "generateDescription",
      async (input: unknown) => {
        const parsed = generateDescriptionInputSchema.parse(input);

        return context.ai.generate<{
          description: string;
        }>({
          prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
          templateName: "decks:description",
        });
      },
    );
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }
    return createDeckTools(this.pluginContext, this.id);
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.info("Shutting down Decks plugin");
  }
}

export function decksPlugin(): DecksPlugin {
  return new DecksPlugin();
}

export default decksPlugin;
