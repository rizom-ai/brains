import type { CorePlugin, CorePluginContext } from "@brains/plugins";
import { noteSchema, NoteAdapter } from "./entity/noteEntity";
import { NoteService } from "./services/noteService";
import { NoteTools } from "./tools/noteTools";
import { NoteMessageHandlers } from "./messaging/noteMessageHandlers";
import type { Logger } from "@brains/utils";

/**
 * Note context configuration schema
 */
import { z } from "@brains/utils";

export const noteContextConfigSchema = z.object({
  defaultFormat: z.enum(["markdown", "text", "html"]).default("markdown"),
  maxNoteLength: z.number().positive().default(10000),
  enableAutoTags: z.boolean().default(true),
});

export type NoteContextConfig = z.infer<typeof noteContextConfigSchema>;

/**
 * Note context plugin
 */
const noteContext: ContextPlugin = {
  id: "note-context",
  version: "1.0.0",
  contextType: "base",
  dependencies: ["core"],

  /**
   * Register note context components
   */
  register(context: PluginContext): PluginLifecycle {
    const {
      registry,
      entityRegistry,
      messageBus,
      toolRegistry,
      logger,
      config,
    } = context;

    // Get note context configuration
    const noteConfig =
      config.getPluginConfig<NoteContextConfig>("note-context");

    logger.info("Registering note context components");

    // Register note service
    registry.register(
      "noteService",
      () => new NoteService(registry, entityRegistry, noteConfig),
    );

    // Register note entity type
    entityRegistry.registerEntityType("base", noteSchema, new NoteAdapter());

    // Register note message handlers
    Object.entries(NoteMessageHandlers).forEach(([messageType, handler]) => {
      messageBus.registerHandler(messageType, handler);
    });

    // Register note tools
    toolRegistry.registerTools(NoteTools);

    // Return lifecycle hooks
    return {
      async onInitialize() {
        logger.info("Initializing note context");

        // Initialize note context
        const noteService = registry.resolve<NoteService>("noteService");
        await noteService.initialize();

        logger.info("Note context initialized");
      },

      async onShutdown() {
        logger.info("Shutting down note context");

        // Clean up resources
        const noteService = registry.resolve<NoteService>("noteService");
        await noteService.shutdown();

        logger.info("Note context shut down");
      },
    };
  },
};

/**
 * Register note context plugin
 */
export function registerNoteContext(): ContextPlugin {
  return noteContext;
}

export default noteContext;
