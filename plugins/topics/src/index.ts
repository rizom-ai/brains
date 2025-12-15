import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type BaseEntity,
  createId,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { TopicExtractor, type ExtractedTopic } from "./lib/topic-extractor";
import { TopicProcessingHandler } from "./handlers/topic-processing-handler";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { TopicsDataSource } from "./datasources/topics-datasource";
import packageJson from "../package.json";
import { createTopicsTools } from "./tools";

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
    const processingHandler = new TopicProcessingHandler(context, this.logger);
    context.registerJobHandler("process-single", processingHandler);

    // Register eval handler for plugin testing
    this.registerEvalHandler(context);

    // Subscribe to entity events for auto-extraction
    if (this.config.enableAutoExtraction) {
      const handleEntityEvent = async (message: {
        payload: { entityType: string; entityId: string; entity?: BaseEntity };
      }): Promise<{ success: boolean }> => {
        const { entityType, entity } = message.payload;

        if (!this.shouldProcessEntityType(entityType)) {
          return { success: true };
        }

        if (!entity) {
          this.logger.debug("Entity not included in event payload, skipping", {
            entityType,
            entityId: message.payload.entityId,
          });
          return { success: true };
        }

        await this.handleEntityChanged(context, entity);
        return { success: true };
      };

      context.subscribe("entity:created", handleEntityEvent);
      context.subscribe("entity:updated", handleEntityEvent);
    }
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      return [];
    }
    return createTopicsTools();
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.info("Shutting down Topics plugin");
  }

  /**
   * Determine if an entity type should be processed for topic extraction
   * Public for testing
   */
  public shouldProcessEntityType(entityType: string): boolean {
    // Always skip topics to prevent recursion
    if (entityType === "topic") {
      return false;
    }

    // Whitelist mode: only process included types
    if (this.config.includeEntityTypes.length > 0) {
      return this.config.includeEntityTypes.includes(entityType);
    }

    // Blacklist mode: process all except excluded types
    return !this.config.excludeEntityTypes.includes(entityType);
  }

  /**
   * Handle entity created/updated events for automatic topic extraction
   */
  private async handleEntityChanged(
    context: ServicePluginContext,
    entity: BaseEntity,
  ): Promise<void> {
    try {
      this.logger.debug("Processing entity for topic extraction", {
        entityId: entity.id,
        entityType: entity.entityType,
        contentLength: entity.content.length,
      });

      // Extract topics from entity content
      const topicExtractor = new TopicExtractor(context, this.logger);
      const extractedTopics = await topicExtractor.extractFromEntity(
        entity,
        this.config.minRelevanceScore,
      );

      if (extractedTopics.length === 0) {
        this.logger.debug("No topics found in entity", {
          entityId: entity.id,
          entityType: entity.entityType,
        });
        return;
      }

      this.logger.debug("Topics extracted from entity", {
        entityId: entity.id,
        entityType: entity.entityType,
        topicsCount: extractedTopics.length,
        topics: extractedTopics.map((t) => t.title),
      });

      // Create batch operations for processing each topic
      const operations = extractedTopics.map((topic) => ({
        type: "topics:process-single",
        data: {
          topic,
          sourceEntityId: entity.id,
          sourceEntityType: entity.entityType,
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
        rootJobId,
        metadata: {
          operationType: "batch_processing" as const,
          operationTarget: `auto-extract for ${entity.entityType}:${entity.id}`,
          pluginId: "topics",
        },
      });

      this.logger.debug("Queued automatic topic extraction batch", {
        batchId,
        entityId: entity.id,
        entityType: entity.entityType,
        topicsExtracted: extractedTopics.length,
      });
    } catch (error) {
      this.logger.error("Failed to process entity for topic extraction", {
        error: error instanceof Error ? error.message : String(error),
        entityId: entity.id,
        entityType: entity.entityType,
      });
    }
  }

  /**
   * Register eval handler for plugin testing
   */
  private registerEvalHandler(context: ServicePluginContext): void {
    const extractor = new TopicExtractor(context, this.logger);

    const entityInputSchema = z.object({
      entityType: z.string(),
      content: z.string(),
      metadata: z.record(z.unknown()).optional(),
    });

    const createEntityFromInput = (
      input: z.infer<typeof entityInputSchema>,
      idSuffix = "",
    ): BaseEntity => ({
      id: `eval${idSuffix}-${Date.now()}`,
      entityType: input.entityType,
      content: input.content,
      metadata: input.metadata ?? {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    const extractTopics = async (
      input: z.infer<typeof entityInputSchema>,
      minRelevanceScore: number,
      idSuffix = "",
    ): Promise<ExtractedTopic[]> => {
      const entity = createEntityFromInput(input, idSuffix);
      return extractor.extractFromEntity(entity, minRelevanceScore);
    };

    // Single entity extraction
    const extractInputSchema = entityInputSchema.extend({
      minRelevanceScore: z.number().optional(),
    });

    context.registerEvalHandler("extractFromEntity", async (input: unknown) => {
      const parsed = extractInputSchema.parse(input);
      const minScore =
        parsed.minRelevanceScore ?? this.config.minRelevanceScore;
      return extractTopics(parsed, minScore);
    });

    // Merge similarity check - tests if two pieces of content produce matching topics
    const mergeTestInputSchema = z.object({
      contentA: entityInputSchema,
      contentB: entityInputSchema,
      minRelevanceScore: z.number().optional(),
    });

    context.registerEvalHandler(
      "checkMergeSimilarity",
      async (input: unknown) => {
        const parsed = mergeTestInputSchema.parse(input);
        const minScore =
          parsed.minRelevanceScore ?? this.config.minRelevanceScore;

        const [topicsA, topicsB] = await Promise.all([
          extractTopics(parsed.contentA, minScore, "-a"),
          extractTopics(parsed.contentB, minScore, "-b"),
        ]);

        // Check for matching titles (case-insensitive)
        const titlesA = topicsA.map((t) => t.title.toLowerCase());
        const titlesB = topicsB.map((t) => t.title.toLowerCase());
        const matchingTitles = titlesA.filter((title) =>
          titlesB.includes(title),
        );

        return {
          topicsA: topicsA.map((t) => ({
            title: t.title,
            relevanceScore: t.relevanceScore,
          })),
          topicsB: topicsB.map((t) => ({
            title: t.title,
            relevanceScore: t.relevanceScore,
          })),
          matchingTitles,
          wouldMerge: matchingTitles.length > 0,
        };
      },
    );

    this.logger.debug(
      "Registered eval handlers: topics:extractFromEntity, topics:checkMergeSimilarity",
    );
  }
}

// Export for use as a plugin
export default TopicsPlugin;

// Export public API for external consumers
export type { TopicsPluginConfig } from "./schemas/config";
export type { TopicEntity } from "./types";
