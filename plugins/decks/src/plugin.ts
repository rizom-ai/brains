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
import { DeckDataSource } from "./datasources/deck-datasource";
import { createDecksTools } from "./tools";
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
    });

    this.logger.info("Decks plugin registered successfully");
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }
    return createDecksTools(this.id, this.pluginContext);
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
