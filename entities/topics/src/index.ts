import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
  type DataSource,
  type Template,
  type BaseEntity,
} from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { TopicExtractor, type ExtractedTopic } from "./lib/topic-extractor";
import { extractTopicsBatched } from "./lib/topic-batch-extractor";
import { TopicProcessingHandler } from "./handlers/topic-processing-handler";
import { TopicExtractionHandler } from "./handlers/topic-extraction-handler";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { TopicsDataSource } from "./datasources/topics-datasource";
import { topicEntitySchema, type TopicEntity } from "./schemas/topic";
import { computeContentHash } from "@brains/utils/hash";
import { createTopicDistributionInsight } from "./insights/topic-distribution";
import packageJson from "../package.json";

const topicAdapter = new TopicAdapter();

export class TopicsPlugin extends EntityPlugin<
  TopicEntity,
  TopicsPluginConfig
> {
  readonly entityType = "topic";
  readonly schema = topicEntitySchema;
  readonly adapter = topicAdapter;

  declare protected config: TopicsPluginConfig;

  /**
   * Auto-extraction starts disabled and is enabled after initial sync completes.
   */
  private autoExtractionEnabled = false;

  constructor(config: Partial<TopicsPluginConfig> = {}) {
    super("topics", packageJson, config, topicsPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 0.5 };
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      extraction: topicExtractionTemplate,
      "topic-list": topicListTemplate,
      "topic-detail": topicDetailTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new TopicsDataSource(this.logger.child("TopicsDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Job handlers
    const processingHandler = new TopicProcessingHandler(context, this.logger);
    context.jobs.registerHandler("process-single", processingHandler);

    const extractionHandler = new TopicExtractionHandler(context, this.logger);
    context.jobs.registerHandler("extract", extractionHandler);

    // Insights
    context.insights.register(
      "topic-distribution",
      createTopicDistributionInsight(),
    );

    // Eval handlers
    this.registerEvalHandler(context);

    // Event subscriptions for auto-extraction
    if (this.config.enableAutoExtraction) {
      context.messaging.subscribe(
        "sync:initial:completed",
        async (): Promise<{ success: boolean }> => {
          this.enableAutoExtraction();
          return { success: true };
        },
      );

      const handleEntityEvent = async (message: {
        payload: {
          entityType: string;
          entityId: string;
          entity?: BaseEntity;
        };
      }): Promise<{ success: boolean }> => {
        if (!this.autoExtractionEnabled) {
          return { success: true };
        }

        const { entityType, entity } = message.payload;
        if (!this.shouldProcessEntityType(entityType)) {
          return { success: true };
        }
        if (!entity) {
          return { success: true };
        }

        await this.handleEntityChanged(context, entity);
        return { success: true };
      };

      context.messaging.subscribe("entity:created", handleEntityEvent);
      context.messaging.subscribe("entity:updated", handleEntityEvent);
    }
  }

  // ── derive() / deriveAll() ──

  /**
   * Extract topics from a single source entity.
   */
  public override async derive(
    source: BaseEntity,
    _event: string,
    context: EntityPluginContext,
  ): Promise<void> {
    if (!this.shouldProcessEntityType(source.entityType)) return;
    if (!this.isEntityPublished(source)) return;
    await this.handleEntityChanged(context, source);
  }

  /**
   * Batch re-extract topics from all source entities.
   * Uses token-budget-aware batching — one LLM call per batch instead of per entity.
   */
  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    const toExtract = await this.getEntitiesToExtract(context);

    if (toExtract.length === 0) {
      this.logger.info("No entities to extract topics from");
      return;
    }

    this.logger.info(`Batch topic extraction: ${toExtract.length} entities`);

    const result = await extractTopicsBatched(toExtract, context, this.logger);

    this.logger.info("Batch topic extraction complete", result);
  }

  // ── Public helpers (used by tests) ──

  public isAutoExtractionEnabled(): boolean {
    return this.autoExtractionEnabled;
  }

  public enableAutoExtraction(): void {
    if (this.config.enableAutoExtraction) {
      this.autoExtractionEnabled = true;
      this.logger.info("Auto-extraction enabled after initial sync");
    }
  }

  public shouldProcessEntityType(entityType: string): boolean {
    if (entityType === "topic") return false;
    return this.config.includeEntityTypes.includes(entityType);
  }

  public isEntityPublished(entity: BaseEntity): boolean {
    const metadata = entity.metadata as Record<string, unknown>;
    const status = metadata["status"];
    return status === "published" || status === undefined || status === null;
  }

  // ── Private helpers ──

  private async getEntitiesToExtract(
    context: EntityPluginContext,
  ): Promise<BaseEntity[]> {
    const typesToProcess = this.getExtractableEntityTypes(context);

    const toExtract: BaseEntity[] = [];
    for (const type of typesToProcess) {
      const entities = await context.entityService.listEntities(type);
      for (const entity of entities) {
        if (!this.isEntityPublished(entity)) continue;
        toExtract.push(entity);
      }
    }

    return toExtract;
  }

  private getExtractableEntityTypes(context: EntityPluginContext): string[] {
    const allTypes = context.entityService.getEntityTypes();
    return allTypes.filter((type) => this.shouldProcessEntityType(type));
  }

  private async handleEntityChanged(
    context: EntityPluginContext,
    entity: BaseEntity,
  ): Promise<void> {
    if (!this.isEntityPublished(entity)) return;

    try {
      await context.jobs.enqueue(
        "extract",
        {
          entityId: entity.id,
          entityType: entity.entityType,
          contentHash: entity.contentHash,
          minRelevanceScore: this.config.minRelevanceScore,
          autoMerge: this.config.autoMerge,
          mergeSimilarityThreshold: this.config.mergeSimilarityThreshold,
        },
        null,
        {
          priority: 5,
          source: "topics-plugin",
          metadata: {
            operationType: "data_processing" as const,
            operationTarget: `topic-extraction:${entity.entityType}:${entity.id}`,
            pluginId: "topics",
          },
        },
      );
    } catch (error) {
      this.logger.error("Failed to queue topic extraction job", {
        error: getErrorMessage(error),
        entityId: entity.id,
        entityType: entity.entityType,
      });
    }
  }

  private registerEvalHandler(context: EntityPluginContext): void {
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

    const extractInputSchema = entityInputSchema.extend({
      minRelevanceScore: z.number().optional(),
    });

    context.eval.registerHandler(
      "extractFromEntity",
      async (input: unknown) => {
        const parsed = extractInputSchema.parse(input);
        const minScore =
          parsed.minRelevanceScore ?? this.config.minRelevanceScore;
        return extractTopics(parsed, minScore);
      },
    );

    const mergeTestInputSchema = z.object({
      contentA: entityInputSchema,
      contentB: entityInputSchema,
      minRelevanceScore: z.number().optional(),
    });

    context.eval.registerHandler(
      "checkMergeSimilarity",
      async (input: unknown) => {
        const parsed = mergeTestInputSchema.parse(input);
        const minScore =
          parsed.minRelevanceScore ?? this.config.minRelevanceScore;

        const [topicsA, topicsB] = await Promise.all([
          extractTopics(parsed.contentA, minScore, "-a"),
          extractTopics(parsed.contentB, minScore, "-b"),
        ]);

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
  }
}

export default TopicsPlugin;

export function topicsPlugin(
  config?: Partial<TopicsPluginConfig>,
): TopicsPlugin {
  return new TopicsPlugin(config);
}

export type { TopicsPluginConfig } from "./schemas/config";
export type { TopicEntity } from "./types";
