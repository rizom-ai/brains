import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
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

// No configuration needed for decks plugin
const decksConfigSchema = z.object({});

/**
 * Decks Plugin - Manages presentation decks stored as markdown with slide separators
 */
export class DecksPlugin extends ServicePlugin<Record<string, never>> {
  private pluginContext?: ServicePluginContext;

  constructor() {
    super("decks", packageJson, {}, decksConfigSchema);
  }

  override async onRegister(context: ServicePluginContext): Promise<void> {
    this.pluginContext = context;
    // Call parent onRegister first to set up base functionality
    await super.onRegister(context);

    // Register deck entity type with formatter and elevated weight for search
    const formatter = new DeckFormatter();
    context.entities.register("deck", formatter.schema, formatter, {
      weight: 1.5,
    });

    // Register deck datasource
    const datasource = new DeckDataSource(context.entityService, this.logger);
    context.entities.registerDataSource(datasource);

    // Register deck templates
    context.templates.register({
      "deck-detail": deckTemplate,
      "deck-list": deckListTemplate,
      generation: deckGenerationTemplate,
      description: deckDescriptionTemplate,
    });

    // Register job handler for deck generation
    const deckGenerationHandler = new DeckGenerationJobHandler(
      this.logger.child("DeckGenerationJobHandler"),
      context,
    );
    context.jobs.registerHandler("generation", deckGenerationHandler);

    // Register eval handlers for AI testing
    this.registerEvalHandlers(context);

    // Register with publish-pipeline
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);

    this.logger.info("Decks plugin registered successfully");
  }

  /**
   * Register with publish-pipeline using internal provider
   */
  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    const internalProvider = {
      name: "internal",
      publish: async (): Promise<{ id: string }> => {
        return { id: "internal" };
      },
    };

    await context.messaging.send("publish:register", {
      entityType: "deck",
      provider: internalProvider,
    });

    this.logger.info("Registered deck with publish-pipeline");
  }

  /**
   * Subscribe to publish:execute messages from publish-pipeline
   */
  private subscribeToPublishExecute(context: ServicePluginContext): void {
    const formatter = new DeckFormatter();

    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;

      // Only handle deck entities
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

        // Skip already published decks
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

        const updatedContent = formatter.toMarkdown(updatedDeck);

        await context.entityService.updateEntity({
          ...updatedDeck,
          content: updatedContent,
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

  /**
   * Register eval handlers for plugin testing
   */
  private registerEvalHandlers(context: ServicePluginContext): void {
    // Generate full slide deck (title, content, description) from prompt
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

    // Generate description from title + content
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
    // List and get functionality provided by system_list and system_get tools
    return createDeckTools(this.pluginContext, this.id);
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.info("Shutting down Decks plugin");
  }
}

/**
 * Factory function to create the decks plugin
 */
export function decksPlugin(): DecksPlugin {
  return new DecksPlugin();
}

// Export for use as a plugin
export default decksPlugin;

// Export public API for external consumers
export type { DeckEntity } from "./schemas/deck";
export { DeckFormatter } from "./formatters/deck-formatter";
export { deckTemplate } from "./templates/deck-template";
