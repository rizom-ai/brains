import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
  type DataSource,
  type Template,
  type BaseEntity,
} from "@brains/plugins";
import { getErrorMessage, ProgressReporter, z } from "@brains/utils";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { TopicExtractor, type ExtractedTopic } from "./lib/topic-extractor";
import { extractTopicsBatched } from "./lib/topic-batch-extractor";
import { TopicService } from "./lib/topic-service";
import { TopicProcessingHandler } from "./handlers/topic-processing-handler";
import { TopicExtractionHandler } from "./handlers/topic-extraction-handler";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicMergeSynthesisTemplate } from "./templates/merge-synthesis-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { TopicsDataSource } from "./datasources/topics-datasource";
import { topicEntitySchema, type TopicEntity } from "./schemas/topic";
import { computeContentHash } from "@brains/utils/hash";
import { createTopicDistributionInsight } from "./insights/topic-distribution";
import packageJson from "../package.json";

const topicAdapter = new TopicAdapter();

/** First sentence of a text block, capped at 200 chars with ellipsis. */
function firstSentence(text: string): string | undefined {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(.*?[.!?])(?:\s|$)/);
  if (match?.[1]) return match[1];
  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}…`;
}

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
  private initialDerivationDone = false;

  constructor(config: Partial<TopicsPluginConfig> = {}) {
    super("topics", packageJson, config, topicsPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 0.5 };
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      extraction: topicExtractionTemplate,
      "merge-synthesis": topicMergeSynthesisTemplate,
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

    // Dashboard widget
    context.messaging.subscribe(
      "system:plugins:ready",
      async (): Promise<{ success: boolean }> => {
        await context.messaging.send("dashboard:register-widget", {
          id: "topics",
          pluginId: this.id,
          title: "Topics",
          section: "secondary",
          priority: 20,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const topics =
              await context.entityService.listEntities<TopicEntity>("topic", {
                limit: 10,
                sortFields: [{ field: "updated", direction: "desc" }],
              });
            return {
              items: topics.map((t) => {
                const body = this.adapter.parseTopicBody(t.content);
                const description = firstSentence(body.content);
                return {
                  id: t.id,
                  name: body.title || t.id,
                  ...(description && { description }),
                };
              }),
            };
          },
        });
        return { success: true };
      },
    );

    // Eval handlers
    this.registerEvalHandler(context);

    // Event subscriptions for auto-extraction
    if (this.config.enableAutoExtraction) {
      context.messaging.subscribe(
        "sync:initial:completed",
        async (): Promise<{ success: boolean }> => {
          this.enableAutoExtraction();

          if (!this.initialDerivationDone) {
            const existingTopics =
              await context.entityService.listEntities<TopicEntity>("topic", {
                limit: 1,
              });
            if (existingTopics.length > 0) {
              this.logger.info(
                "Skipping initial topic extraction; topics already exist",
              );
              return { success: true };
            }
            await this.enqueueInitialDerivation(context);
            this.initialDerivationDone = true;
          }

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

  /**
   * Operator reset — delete all topics and rebuild from current source entities.
   */
  public override async rebuildAll(
    context: EntityPluginContext,
  ): Promise<void> {
    const toExtract = await this.getEntitiesToExtract(context);
    const result = await this.replaceAllTopics(toExtract, context);
    this.logger.info("Topic rebuild complete", result);
  }

  // ── Public helpers (used by tests) ──

  public isAutoExtractionEnabled(): boolean {
    return this.autoExtractionEnabled;
  }

  public hasRunInitialDerivation(): boolean {
    return this.initialDerivationDone;
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

  private async enqueueInitialDerivation(
    context: EntityPluginContext,
  ): Promise<void> {
    await context.jobs.enqueue("extract", { mode: "derive" }, null, {
      priority: 5,
      source: "topics-plugin",
      deduplication: "coalesce",
      deduplicationKey: "topics-initial-derivation",
      metadata: {
        operationType: "data_processing" as const,
        operationTarget: "topics-initial-derivation",
        pluginId: "topics",
      },
    });
  }

  private async replaceAllTopics(
    entities: BaseEntity[],
    context: EntityPluginContext,
  ): Promise<{
    deleted: number;
    created: number;
    skipped: number;
    batches: number;
  }> {
    const topicService = new TopicService(context.entityService, this.logger);
    const existingTopics = await topicService.listTopics();

    for (const topic of existingTopics) {
      await topicService.deleteTopic(topic.id);
    }

    if (entities.length === 0) {
      return {
        deleted: existingTopics.length,
        created: 0,
        skipped: 0,
        batches: 0,
      };
    }

    const result = await extractTopicsBatched(entities, context, this.logger);
    return {
      deleted: existingTopics.length,
      ...result,
    };
  }

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

    const detectionTopicSchema = z.object({
      title: z.string(),
      content: z.string(),
    });

    const detectMergeCandidateSchema = z.object({
      existingTopics: z.array(detectionTopicSchema),
      incomingTopic: detectionTopicSchema,
      threshold: z.number().optional(),
    });

    context.eval.registerHandler(
      "detectMergeCandidate",
      async (input: unknown) => {
        const parsed = detectMergeCandidateSchema.parse(input);
        const threshold =
          parsed.threshold ?? this.config.mergeSimilarityThreshold;
        const topicService = new TopicService(
          context.entityService,
          this.logger,
        );

        for (const existingTopic of parsed.existingTopics) {
          await topicService.createTopic(existingTopic);
        }

        const candidate = await topicService.findMergeCandidate(
          {
            title: parsed.incomingTopic.title,
          },
          threshold,
        );

        return {
          found: candidate !== null,
          candidateTitle: candidate?.title,
          candidateScore: candidate?.score,
        };
      },
    );

    const aliasMergeSchema = z.object({
      existingAliases: z.array(z.string()).optional(),
      canonicalTitle: z.string(),
      candidateAliases: z.array(z.string()),
    });

    context.eval.registerHandler("mergeAliases", async (input: unknown) => {
      const parsed = aliasMergeSchema.parse(input);
      const topicService = new TopicService(context.entityService, this.logger);

      return {
        aliases: topicService.mergeAliases(
          parsed.existingAliases,
          parsed.canonicalTitle,
          parsed.candidateAliases,
        ),
      };
    });

    const mergeProcessingSchema = z.object({
      existingTopics: z
        .array(
          detectionTopicSchema.extend({
            aliases: z.array(z.string()).optional(),
          }),
        )
        .default([]),
      incomingTopic: detectionTopicSchema.extend({
        relevanceScore: z.number().min(0).max(1).optional(),
      }),
      threshold: z.number().optional(),
    });

    context.eval.registerHandler(
      "processTopicWithAutoMerge",
      async (input: unknown) => {
        const parsed = mergeProcessingSchema.parse(input);
        const topicService = new TopicService(
          context.entityService,
          this.logger,
        );

        for (const existingTopic of parsed.existingTopics) {
          await topicService.createTopic({
            title: existingTopic.title,
            content: existingTopic.content,
            metadata: { aliases: existingTopic.aliases ?? [] },
          });
        }

        const handler = new TopicProcessingHandler(context, this.logger);
        const progressReporter = ProgressReporter.from(async () => {});
        if (!progressReporter) {
          throw new Error("Failed to create progress reporter");
        }

        const result = await handler.process(
          {
            topic: {
              title: parsed.incomingTopic.title,
              content: parsed.incomingTopic.content,
              relevanceScore: parsed.incomingTopic.relevanceScore ?? 0.9,
            },
            sourceEntityId: "eval-source",
            sourceEntityType: "post",
            autoMerge: true,
            mergeSimilarityThreshold:
              parsed.threshold ?? this.config.mergeSimilarityThreshold,
          },
          `eval-job-${Date.now()}`,
          progressReporter,
        );

        const topics = await context.entityService.listEntities("topic");
        return {
          ...result,
          topicCount: topics.length,
          topics: topics.map((t) => {
            const parsed = this.adapter.parseTopicBody(t.content);
            return {
              id: t.id,
              title: parsed.title,
              content: parsed.content,
              metadata: t.metadata,
            };
          }),
        };
      },
    );

    const sequentialInputSchema = z.object({
      entities: z.array(entityInputSchema).min(1),
      minRelevanceScore: z.number().optional(),
    });

    const rebuildTopicsSchema = z.object({
      existingTopics: z.array(detectionTopicSchema).optional(),
      entities: z.array(entityInputSchema),
    });

    context.eval.registerHandler("rebuildTopics", async (input: unknown) => {
      const parsed = rebuildTopicsSchema.parse(input);
      const topicService = new TopicService(context.entityService, this.logger);

      for (const existingTopic of parsed.existingTopics ?? []) {
        await topicService.createTopic(existingTopic);
      }

      const entities = parsed.entities.map((e, i) =>
        createEntityFromInput(e, `-rebuild-${i}`),
      );

      const result = await this.replaceAllTopics(entities, context);
      const topics = await context.entityService.listEntities("topic");

      return {
        ...result,
        topicCount: topics.length,
        topics: topics.map((t) => {
          const parsed = this.adapter.parseTopicBody(t.content);
          return {
            id: t.id,
            title: parsed.title,
            content: parsed.content,
            metadata: t.metadata,
          };
        }),
      };
    });

    context.eval.registerHandler(
      "extractSequentially",
      async (input: unknown) => {
        const parsed = sequentialInputSchema.parse(input);
        const minScore =
          parsed.minRelevanceScore ?? this.config.minRelevanceScore;
        const topicService = new TopicService(
          context.entityService,
          this.logger,
        );
        const perEntity: Array<{ extractedTitles: string[] }> = [];

        for (const [index, entityInput] of parsed.entities.entries()) {
          const entity = createEntityFromInput(
            entityInput,
            `-sequential-${index}`,
          );
          const extracted = await extractor.extractFromEntity(entity, minScore);

          for (const topic of extracted) {
            await topicService.createTopic({
              title: topic.title,
              content: topic.content,
            });
          }

          perEntity.push({
            extractedTitles: extracted.map((topic) => topic.title),
          });
        }

        const topics = await context.entityService.listEntities("topic");
        return {
          totalTopics: topics.length,
          perEntity,
          topics: topics.map((t) => {
            const parsed = this.adapter.parseTopicBody(t.content);
            return {
              id: t.id,
              title: parsed.title,
              content: parsed.content,
            };
          }),
        };
      },
    );

    const batchInputSchema = z.object({
      entities: z.array(entityInputSchema),
    });

    context.eval.registerHandler("batchExtract", async (input: unknown) => {
      const parsed = batchInputSchema.parse(input);
      const entities = parsed.entities.map((e, i) =>
        createEntityFromInput(e, `-batch-${i}`),
      );

      const result = await extractTopicsBatched(entities, context, this.logger);

      // Return created topics so the eval can inspect them
      const topics = await context.entityService.listEntities("topic");
      return {
        ...result,
        topics: topics.map((t) => {
          const parsed = this.adapter.parseTopicBody(t.content);
          return {
            id: t.id,
            title: parsed.title,
            content: parsed.content,
          };
        }),
      };
    });
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
