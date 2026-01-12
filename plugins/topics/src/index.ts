import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
  type PluginResource,
  type BaseEntity,
} from "@brains/plugins";
import { z, computeContentHash } from "@brains/utils";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { TopicExtractor, type ExtractedTopic } from "./lib/topic-extractor";
import { TopicProcessingHandler } from "./handlers/topic-processing-handler";
import { TopicExtractionHandler } from "./handlers/topic-extraction-handler";
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

  /**
   * Auto-extraction starts disabled and is enabled after initial sync completes.
   * This prevents flooding the job queue during startup when directory-sync imports entities.
   */
  private autoExtractionEnabled = false;

  constructor(config: Partial<TopicsPluginConfig> = {}) {
    super("topics", packageJson, config, topicsPluginConfigSchema);
  }

  /**
   * Check if auto-extraction is currently enabled.
   * Returns false during startup, true after sync:initial:completed.
   */
  public isAutoExtractionEnabled(): boolean {
    return this.autoExtractionEnabled;
  }

  /**
   * Enable auto-extraction. Called after sync:initial:completed.
   * Only enables if config.enableAutoExtraction is true.
   */
  public enableAutoExtraction(): void {
    if (this.config.enableAutoExtraction) {
      this.autoExtractionEnabled = true;
      this.logger.info("Auto-extraction enabled after initial sync");
    }
  }

  override async onRegister(context: ServicePluginContext): Promise<void> {
    // Call parent onRegister first to set up base functionality
    await super.onRegister(context);

    // Register topic entity type with lower weight (metadata entity)
    const adapter = new TopicAdapter();
    context.entities.register("topic", adapter.schema, adapter, {
      weight: 0.5,
    });

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
    context.entities.registerDataSource(topicsDataSource);

    // Register job handlers
    const processingHandler = new TopicProcessingHandler(context, this.logger);
    context.jobs.registerHandler("process-single", processingHandler);

    const extractionHandler = new TopicExtractionHandler(context, this.logger);
    context.jobs.registerHandler("extract", extractionHandler);

    // Register eval handler for plugin testing
    this.registerEvalHandler(context);

    // Subscribe to sync:initial:completed to enable auto-extraction after startup
    if (this.config.enableAutoExtraction) {
      context.subscribe(
        "sync:initial:completed",
        async (): Promise<{ success: boolean }> => {
          this.enableAutoExtraction();
          return { success: true };
        },
      );

      // Subscribe to entity events for auto-extraction
      const handleEntityEvent = async (message: {
        payload: { entityType: string; entityId: string; entity?: BaseEntity };
      }): Promise<{ success: boolean }> => {
        // Skip if auto-extraction not yet enabled (during startup)
        if (!this.autoExtractionEnabled) {
          this.logger.debug(
            "Skipping extraction - auto-extraction not yet enabled",
            {
              entityId: message.payload.entityId,
            },
          );
          return { success: true };
        }

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
    return createTopicsTools(this.context, (options) =>
      this.getEntitiesToExtract(options),
    );
  }

  /**
   * Get entity types that should be processed for topic extraction
   */
  public getExtractableEntityTypes(): string[] {
    if (!this.context) {
      return [];
    }
    const allTypes = this.context.entityService.getEntityTypes();
    return allTypes.filter((type) => this.shouldProcessEntityType(type));
  }

  /**
   * Get entities that need topic extraction.
   * Filters by extractable types, skips drafts, and optionally skips already-processed entities.
   */
  public async getEntitiesToExtract(options?: {
    entityTypes?: string[] | undefined;
    limit?: number | undefined;
    force?: boolean | undefined;
  }): Promise<BaseEntity[]> {
    if (!this.context) {
      return [];
    }

    const { entityTypes, limit, force = false } = options ?? {};

    // Determine which types to process
    const typesToProcess =
      entityTypes && entityTypes.length > 0
        ? entityTypes.filter((t) => this.shouldProcessEntityType(t))
        : this.getExtractableEntityTypes();

    // Get processed content hashes from existing topics (unless force=true)
    const processedHashes = new Set<string>();
    if (!force) {
      const topics = await this.context.entityService.listEntities("topic");
      for (const topic of topics) {
        const metadata = topic.metadata as {
          sources?: Array<{ contentHash?: string }>;
        };
        if (metadata.sources) {
          for (const source of metadata.sources) {
            if (source.contentHash) {
              processedHashes.add(source.contentHash);
            }
          }
        }
      }
    }

    // Collect entities to extract
    const toExtract: BaseEntity[] = [];
    for (const type of typesToProcess) {
      const entities = await this.context.entityService.listEntities(type);
      for (const entity of entities) {
        // Skip drafts
        if (!this.isEntityPublished(entity)) {
          continue;
        }
        // Skip already processed (unless force)
        if (!force && processedHashes.has(entity.contentHash)) {
          continue;
        }
        toExtract.push(entity);
      }
    }

    // Apply limit if specified
    return limit !== undefined ? toExtract.slice(0, limit) : toExtract;
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
   * Determine if an entity is published (not a draft)
   * Drafts should not trigger topic extraction - only published content
   * Public for testing
   */
  public isEntityPublished(entity: BaseEntity): boolean {
    const metadata = entity.metadata as Record<string, unknown>;
    return metadata["status"] !== "draft";
  }

  /**
   * Handle entity created/updated events for automatic topic extraction
   * Queues an extraction job instead of blocking on AI extraction
   */
  private async handleEntityChanged(
    context: ServicePluginContext,
    entity: BaseEntity,
  ): Promise<void> {
    // Skip draft entities - only extract topics from published content
    if (!this.isEntityPublished(entity)) {
      this.logger.debug("Skipping topic extraction for draft entity", {
        entityId: entity.id,
        entityType: entity.entityType,
      });
      return;
    }

    try {
      this.logger.debug("Queuing topic extraction for entity", {
        entityId: entity.id,
        entityType: entity.entityType,
        contentLength: entity.content.length,
      });

      // Queue extraction job - the AI extraction runs asynchronously
      // This prevents blocking entity creation/updates
      await context.jobs.enqueue(
        "extract",
        {
          entityId: entity.id,
          entityType: entity.entityType,
          entityContent: entity.content,
          entityMetadata: entity.metadata,
          entityCreated: entity.created,
          entityUpdated: entity.updated,
          minRelevanceScore: this.config.minRelevanceScore,
          autoMerge: this.config.autoMerge,
          mergeSimilarityThreshold: this.config.mergeSimilarityThreshold,
        },
        null,
        {
          priority: 5, // Low priority - background processing
          source: "topics-plugin",
          metadata: {
            operationType: "data_processing" as const,
            operationTarget: `topic-extraction:${entity.entityType}:${entity.id}`,
            pluginId: "topics",
          },
        },
      );

      this.logger.debug("Queued topic extraction job", {
        entityId: entity.id,
        entityType: entity.entityType,
      });
    } catch (error) {
      this.logger.error("Failed to queue topic extraction job", {
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
      contentHash: computeContentHash(input.content),
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
