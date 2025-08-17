import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type Command,
  type ConversationDigestPayload,
} from "@brains/plugins";
import { conversationDigestPayloadSchema } from "@brains/conversation-service";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
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

  constructor(config: Partial<TopicsPluginConfig> = {}) {
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

    // Subscribe to conversation digest events for auto-extraction
    if (this.config.enableAutoExtraction) {
      context.subscribe(
        "conversation:digest",
        async (message) => {
          const payload = conversationDigestPayloadSchema.parse(message.payload);
          await this.handleConversationDigest(context, payload);
          return { success: true };
        },
      );
      this.logger.info(
        "Subscribed to conversation digest events for auto-extraction",
      );
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

  /**
   * Handle conversation digest events for automatic topic extraction
   */
  private async handleConversationDigest(
    context: ServicePluginContext,
    payload: ConversationDigestPayload,
  ): Promise<void> {
    try {
      this.logger.debug("Processing conversation digest for topic extraction", {
        conversationId: payload.conversationId,
        messageCount: payload.messageCount,
        windowSize: payload.windowSize,
      });

      // Queue a topic extraction job using the digest messages
      const jobData = {
        conversationId: payload.conversationId,
        messages: payload.messages,
        windowStart: payload.windowStart,
        windowEnd: payload.windowEnd,
      };

      await context.enqueueJob("topics:extraction", jobData, {
        priority: 1, // Lower priority than manual extractions
        source: "topics-plugin",
        metadata: {
          interfaceId: "digest",
          userId: "system",
          operationType: "data_processing" as const,
          pluginId: "topics",
        },
      });

      this.logger.debug("Queued automatic topic extraction job", {
        conversationId: payload.conversationId,
        messagesProcessed: payload.messages.length,
      });
    } catch (error) {
      this.logger.error("Failed to process conversation digest", {
        error: error instanceof Error ? error.message : String(error),
        conversationId: payload.conversationId,
      });
    }
  }
}

// Export for use as a plugin
export default TopicsPlugin;

// Export public API for external consumers
export type { TopicsPluginConfig } from "./schemas/config";
export type { TopicEntity } from "./types";
