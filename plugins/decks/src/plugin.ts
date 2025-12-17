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

    // Register deck entity type with formatter
    const formatter = new DeckFormatter();
    context.registerEntityType("deck", formatter.schema, formatter);

    // Register deck datasource
    const datasource = new DeckDataSource(context.entityService, this.logger);
    context.registerDataSource(datasource);

    // Register deck templates
    context.registerTemplates({
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
    context.registerJobHandler("generation", deckGenerationHandler);

    // Register eval handlers for AI testing
    this.registerEvalHandlers(context);

    this.logger.info("Decks plugin registered successfully");
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

    context.registerEvalHandler("generateDeck", async (input: unknown) => {
      const parsed = generateDeckInputSchema.parse(input);
      const generationPrompt = `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`;

      return context.generateContent<{
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

    context.registerEvalHandler(
      "generateDescription",
      async (input: unknown) => {
        const parsed = generateDescriptionInputSchema.parse(input);

        return context.generateContent<{
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
