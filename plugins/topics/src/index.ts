import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type Command,
  type ConversationDigestPayload,
  createId,
} from "@brains/plugins";
import { conversationDigestPayloadSchema } from "@brains/conversation-service";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { TopicExtractor } from "./lib/topic-extractor";
import { TopicExtractionHandler } from "./handlers/topic-extraction-handler";
import { TopicProcessingHandler } from "./handlers/topic-processing-handler";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { TopicsDataSource } from "./datasources/topics-datasource";
import packageJson from "../package.json";
import { createTopicsTools } from "./tools";
import { createTopicsCommands } from "./commands";

/**
 * Topics Plugin - Extracts and manages topics from conversations and other sources
 */
export class TopicsPlugin extends ServicePlugin<TopicsPluginConfig> {
  declare protected config: TopicsPluginConfig;

  constructor(config: Partial<TopicsPluginConfig> = {}) {
    super("topics", packageJson, config, topicsPluginConfigSchema);
  }

  override async onRegister(context: ServicePluginContext): Promise<void> {
    // Call parent onRegister first to set up base functionality
    await super.onRegister(context);

    // Register topic entity type
    const adapter = new TopicAdapter();
    context.registerEntityType("topic", adapter.schema, adapter);

    // Register templates
    context.registerTemplates({
      extraction: topicExtractionTemplate,
      "topic-list": topicListTemplate,
      "topic-detail": topicDetailTemplate,
    });

    // Register DataSource
    const topicsDataSource = new TopicsDataSource(
      context.entityService,
      this.logger.child("TopicsDataSource"),
    );
    context.registerDataSource(topicsDataSource);

    // Register job handlers
    const extractionHandler = new TopicExtractionHandler(
      context,
      this.config,
      this.logger,
    );
    context.registerJobHandler("extraction", extractionHandler);

    const processingHandler = new TopicProcessingHandler(context, this.logger);
    context.registerJobHandler("process-single", processingHandler);

    // Subscribe to conversation digest events for auto-extraction
    if (this.config.enableAutoExtraction) {
      context.subscribe("conversation:digest", async (message) => {
        const payload = conversationDigestPayloadSchema.parse(message.payload);
        await this.handleConversationDigest(context, payload);
        return { success: true };
      });
    }
  }

  protected override async getCommands(): Promise<Command[]> {
    if (!this.context) {
      return [];
    }
    return createTopicsCommands(this.context, this.config, this.logger);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      return [];
    }
    return createTopicsTools(this.context, this.config, this.logger);
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
      this.logger.info("Processing conversation digest for topic extraction", {
        conversationId: payload.conversationId,
        messageCount: payload.messageCount,
        windowSize: payload.windowSize,
        messagesLength: payload.messages.length,
      });

      // Extract topics directly (like command does)
      const topicExtractor = new TopicExtractor(context, this.logger);
      const extractedTopics = await topicExtractor.extractFromMessages(
        payload.conversationId,
        payload.messages,
        this.config.minRelevanceScore,
      );

      if (extractedTopics.length === 0) {
        this.logger.info("No topics found in digest", {
          conversationId: payload.conversationId,
          messagesProcessed: payload.messages.length,
        });
        return;
      }

      this.logger.info("Topics extracted from digest", {
        conversationId: payload.conversationId,
        topicsCount: extractedTopics.length,
        topics: extractedTopics.map((t) => t.title),
      });

      // Create batch operations for processing each topic
      const operations = extractedTopics.map((topic) => ({
        type: "topics:process-single",
        data: {
          topic,
          conversationId: payload.conversationId,
          autoMerge: this.config.autoMerge,
          mergeSimilarityThreshold: this.config.mergeSimilarityThreshold,
        },
        metadata: {
          operationType: "topic_processing" as const,
          operationTarget: topic.title,
        },
      }));

      // Queue batch with system-generated rootJobId
      const rootJobId = createId();
      const batchId = await context.enqueueBatch(operations, {
        priority: 1, // Lower priority than manual extractions
        source: "topics-plugin",
        metadata: {
          rootJobId,
          operationType: "batch_processing" as const,
          operationTarget: `auto-extract for ${payload.conversationId}`,
          pluginId: "topics",
        },
      });

      this.logger.info("Queued automatic topic extraction batch", {
        batchId,
        conversationId: payload.conversationId,
        topicsExtracted: extractedTopics.length,
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
