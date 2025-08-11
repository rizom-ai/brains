import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type Command,
  type CommandContext,
  type CommandResponse,
  type JobOptions,
} from "@brains/plugins";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
  type TopicsPluginConfigInput,
  defaultTopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { TopicExtractionHandler } from "./handlers/topic-extraction-handler";
import { topicExtractionTemplate } from "./templates/extraction-template";
import packageJson from "../package.json";
import {
  createExtractTool,
  createListTool,
  createGetTool,
  createSearchTool,
  createMergeTool,
} from "./tools";

/**
 * Topics Plugin - Extracts and manages topics from conversations and other sources
 */
export class TopicsPlugin extends ServicePlugin<TopicsPluginConfig> {
  declare protected config: TopicsPluginConfig;

  private tools: PluginTool[] = [];
  private commands: Command[] = [];

  constructor(config: TopicsPluginConfigInput = {}) {
    super(
      "topics",
      packageJson,
      config,
      topicsPluginConfigSchema,
      defaultTopicsPluginConfig,
    );
  }

  override async onRegister(context: ServicePluginContext): Promise<void> {
    this.logger.info("Registering Topics plugin");

    // Register topic entity type
    const adapter = new TopicAdapter();
    context.registerEntityType("topic", adapter.schema, adapter);

    // Register templates
    context.registerTemplates({
      extraction: topicExtractionTemplate,
    });

    // Register job handler for extraction
    const extractionHandler = new TopicExtractionHandler(
      context,
      this.config,
      this.logger,
    );
    context.registerJobHandler("topics:extraction", extractionHandler);

    // Register tools and commands
    const tools = [
      createExtractTool(context, this.config, this.logger),
      createListTool(context, this.config, this.logger),
      createGetTool(context, this.config, this.logger),
      createSearchTool(context, this.config, this.logger),
      createMergeTool(context, this.config, this.logger),
    ];

    tools.forEach((tool) => {
      const command: Command = {
        name: tool.name,
        description: tool.description,
        handler: async (
          args: string[],
          _context: CommandContext,
        ): Promise<CommandResponse> => {
          // Parse arguments into parameters
          const params: Record<string, unknown> = {};

          // Parse named parameters (--param=value or --param value)
          for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (!arg) continue;

            if (arg.startsWith("--")) {
              const equalIndex = arg.indexOf("=");
              if (equalIndex > 2) {
                // --param=value format
                const key = arg.slice(2, equalIndex);
                const value = arg.slice(equalIndex + 1);
                const numValue = Number(value);
                params[key] = isNaN(numValue) ? value : numValue;
              } else {
                // --param format (might have value as next arg)
                const key = arg.slice(2);
                const nextArg = args[i + 1];
                if (
                  i + 1 < args.length &&
                  nextArg &&
                  !nextArg.startsWith("--")
                ) {
                  const numValue = Number(nextArg);
                  params[key] = isNaN(numValue) ? nextArg : numValue;
                  i++; // Skip next argument
                } else {
                  params[key] = true; // Flag without value
                }
              }
            }
          }

          const result = await tool.execute(params);

          if (result.success) {
            // Return as message with formatted data
            const dataStr = JSON.stringify(result.data, null, 2);
            return {
              type: "message",
              message: dataStr,
            };
          } else {
            return {
              type: "message",
              message: `Error: ${result.error ?? "Command failed"}`,
            };
          }
        },
      };

      // Commands are returned as part of capabilities
      this.commands.push(command);
    });

    // Set up automatic extraction if enabled
    if (this.config.autoExtract) {
      // Schedule periodic extraction
      this.scheduleExtraction(context);
    }
  }

  override async getCommands(): Promise<Command[]> {
    return this.commands;
  }

  override async getTools(): Promise<PluginTool[]> {
    return this.tools;
  }

  override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  override async shutdown(): Promise<void> {
    this.logger.info("Unregistering Topics plugin");
  }

  private scheduleExtraction(context: ServicePluginContext): void {
    const jobOptions: JobOptions = {
      priority: 5,
      source: this.id,
      metadata: {
        interfaceId: "system",
        userId: "system",
        operationType: "batch_processing",
        pluginId: this.id,
      },
    };

    // Queue initial extraction job after a delay
    setTimeout(async () => {
      await context.enqueueJob(
        "topics:extraction",
        {
          hours: this.config.extractionWindowHours,
          minScore: this.config.minRelevanceScore,
        },
        jobOptions,
      );
    }, 60000); // 1 minute delay

    // Schedule periodic extraction (every extractionWindowHours)
    setInterval(
      async () => {
        await context.enqueueJob(
          "topics:extraction",
          {
            hours: this.config.extractionWindowHours,
            minScore: this.config.minRelevanceScore,
          },
          jobOptions,
        );
      },
      (this.config.extractionWindowHours ?? 24) * 60 * 60 * 1000,
    );
  }
}

// Export for use as a plugin
export default TopicsPlugin;
