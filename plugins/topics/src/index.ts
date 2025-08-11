import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type Command,
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
import { createTopicsCommands } from "./commands";

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

    // Store tools for MCP
    this.tools = [
      createExtractTool(context, this.config, this.logger),
      createListTool(context, this.config, this.logger),
      createGetTool(context, this.config, this.logger),
      createSearchTool(context, this.config, this.logger),
      createMergeTool(context, this.config, this.logger),
    ];

    // Store commands for CLI
    this.commands = createTopicsCommands(context, this.config, this.logger);

    // Set up automatic extraction if enabled
    if (this.config.autoExtract) {
      // Schedule periodic extraction
      this.scheduleExtraction(context);
    }
  }

  protected override async getCommands(): Promise<Command[]> {
    return this.commands;
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return this.tools;
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.info("Shutting down Topics plugin");
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
