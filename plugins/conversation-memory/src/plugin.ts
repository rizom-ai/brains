import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
} from "@brains/plugins";
import { z } from "zod";
import {
  conversationMemoryConfigSchema,
  type ConversationMemoryConfig,
  type IConversationMemoryService,
} from "./types";
import { ConversationMemoryService } from "./lib/conversation-memory-service";
import {
  createConversationDatabase,
  enableWALModeForConversations,
} from "./db";
import { createConversationTools } from "./tools";
import { ConversationTopicAdapter } from "./lib/topic-adapter";
import { conversationTopicTemplate } from "./templates/conversation-topic-template";
import { ConversationTopicJobHandler } from "./handlers/conversationTopicJobHandler";
import packageJson from "../package.json";

/**
 * Conversation Memory Plugin
 *
 * Provides conversation tracking and context management for interfaces.
 * Stores conversations in a separate SQLite database and creates summary
 * entities for semantic search.
 */
export class ConversationMemoryPlugin extends ServicePlugin<ConversationMemoryConfig> {
  declare protected config: ConversationMemoryConfig;

  private service: IConversationMemoryService | undefined;

  constructor(config: ConversationMemoryConfig = {}) {
    const defaults: ConversationMemoryConfig = {
      databaseUrl: "file:./data/conversation-memory.db",
      summarization: {
        minMessages: 20,
        minTimeMinutes: 60,
        idleTimeMinutes: 30,
        enableAutomatic: true,
        batchSize: 20,
        overlapPercentage: 0.25,
        similarityThreshold: 0.7,
        targetLength: 400,
        maxLength: 1000,
      },
      retention: {
        unlimited: true,
        daysToKeep: 30,
      },
    };

    super(
      "conversation-memory",
      packageJson,
      config,
      conversationMemoryConfigSchema,
      defaults,
    );
  }

  /**
   * Initialize the plugin and register services
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Initialize database
    const dbConfig = this.config.databaseUrl
      ? { url: this.config.databaseUrl }
      : undefined;
    const { db, client, url } = createConversationDatabase(dbConfig);

    // Enable WAL mode asynchronously (non-blocking)
    enableWALModeForConversations(client, url).catch((error) => {
      this.logger.warn("Failed to enable WAL mode (non-fatal)", error);
    });

    // Create service
    this.service = new ConversationMemoryService(db, context, this.config);

    // Register message handlers for service operations
    this.registerMessageHandlers(context);

    // Register entity type for topics
    const adapter = new ConversationTopicAdapter();
    context.registerEntityType("conversation-topic", adapter.schema, adapter);

    // Register conversation topic template with content generator
    context.registerTemplates({
      "conversation-topic": conversationTopicTemplate,
    });

    // Register job handler for conversation topic generation
    const topicJobHandler = new ConversationTopicJobHandler(
      db,
      context,
      this.config,
    );
    context.registerJobHandler(topicJobHandler.type, topicJobHandler);

    this.logger.info("Conversation memory plugin registered", {
      databaseUrl: this.config.databaseUrl,
      summarization: this.config.summarization,
    });
  }

  /**
   * Register message bus handlers for conversation operations
   */
  private registerMessageHandlers(context: ServicePluginContext): void {
    if (!this.service) {
      throw new Error("Service not initialized");
    }
    const service = this.service;

    // Define schemas for message payloads
    const startConversationSchema = z.object({
      sessionId: z.string(),
      interfaceType: z.string(),
    });

    const addMessageSchema = z.object({
      conversationId: z.string(),
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
      metadata: z.record(z.unknown()).optional(),
    });

    const getMessagesSchema = z.object({
      conversationId: z.string(),
      limit: z.number().optional(),
    });

    const checkSummarizationSchema = z.object({
      conversationId: z.string(),
    });

    // Start conversation
    context.subscribe("conversation:start", async (message) => {
      const data = startConversationSchema.parse(message.payload);
      const conversationId = await service.startConversation(
        data.sessionId,
        data.interfaceType,
      );
      return { success: true, data: { conversationId } };
    });

    // Add message
    context.subscribe("conversation:addMessage", async (message) => {
      const data = addMessageSchema.parse(message.payload);
      await service.addMessage(
        data.conversationId,
        data.role,
        data.content,
        data.metadata,
      );
      return { success: true };
    });

    // Get recent messages
    context.subscribe("conversation:getMessages", async (message) => {
      const data = getMessagesSchema.parse(message.payload);
      const messages = await service.getRecentMessages(
        data.conversationId,
        data.limit,
      );
      return { success: true, data: { messages } };
    });

    // Check summarization
    context.subscribe("conversation:checkSummarization", async (message) => {
      const data = checkSummarizationSchema.parse(message.payload);
      const needed = await service.checkSummarizationNeeded(
        data.conversationId,
      );
      if (needed) {
        await service.createSummary(data.conversationId);
      }
      return { success: true, data: { needed } };
    });
  }

  /**
   * Get MCP tools for conversation access
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.service) {
      return [];
    }
    return createConversationTools(this.service, this.id);
  }

  /**
   * Clean up resources on shutdown
   */
  override async shutdown(): Promise<void> {
    // Close database connection if needed
    // SQLite connections are typically lightweight and don't need explicit closing
    this.logger.info("Conversation memory plugin shutdown");
  }
}
