import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { noteSchema } from "./schemas/note";
import { noteAdapter } from "./adapters/note-adapter";
import { createNoteTools } from "./tools";
import type { NoteConfig, NoteConfigInput } from "./config";
import { noteConfigSchema } from "./config";
import { noteGenerationTemplate } from "./templates/generation-template";
import { NoteGenerationJobHandler } from "./handlers/noteGenerationJobHandler";
import packageJson from "../package.json";

/**
 * Note Plugin
 * Provides personal knowledge capture with markdown-first workflow
 */
export class NotePlugin extends ServicePlugin<NoteConfig> {
  private pluginContext?: ServicePluginContext;

  constructor(config: NoteConfigInput) {
    super("note", packageJson, config, noteConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register note entity type
    context.entities.register("note", noteSchema, noteAdapter);

    // Register generation template
    context.templates.register({
      generation: noteGenerationTemplate,
    });

    // Register job handler for note generation
    const noteGenerationHandler = new NoteGenerationJobHandler(
      this.logger.child("NoteGenerationJobHandler"),
      context,
    );
    context.jobs.registerHandler("generation", noteGenerationHandler);

    // Register eval handlers for AI testing
    this.registerEvalHandlers(context);

    this.logger.info("Note plugin registered successfully");
  }

  /**
   * Register eval handlers for plugin testing
   */
  private registerEvalHandlers(context: ServicePluginContext): void {
    // Generate note (title, body) from prompt
    const generateNoteInputSchema = z.object({
      prompt: z.string(),
    });

    context.eval.registerHandler("generateNote", async (input: unknown) => {
      const parsed = generateNoteInputSchema.parse(input);

      return context.ai.generate<{
        title: string;
        body: string;
      }>({
        prompt: parsed.prompt,
        templateName: "note:generation",
      });
    });
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return createNoteTools(this.id, this.pluginContext);
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }
}

/**
 * Factory function to create the plugin
 */
export function notePlugin(config: NoteConfigInput = {}): Plugin {
  return new NotePlugin(config);
}
