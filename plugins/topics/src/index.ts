import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type Command,
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
}

// Export for use as a plugin
export default TopicsPlugin;

// Export public API for external consumers
export type {
  TopicsPluginConfig,
  TopicsPluginConfigInput,
} from "./schemas/config";
export type { TopicEntity } from "./types";
