import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
  type DataSource,
  type Template,
  type BaseEntity,
  type DerivedEntityProjection,
  hasPersistedTargets,
} from "@brains/plugins";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicMergeSynthesisTemplate } from "./templates/merge-synthesis-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { TopicsDataSource } from "./datasources/topics-datasource";
import { topicEntitySchema, type TopicEntity } from "./schemas/topic";
import { createTopicDistributionInsight } from "./insights/topic-distribution";
import { registerTopicsDashboardWidget } from "./lib/dashboard-widget";
import { registerTopicEvalHandlers } from "./lib/eval-handlers";
import {
  createTopicProjectionHandler,
  extractAllTopics,
  getInitialProjectionJobOptions,
  rebuildAllTopics,
  TopicSourceBatchBuffer,
  type TopicProjectionJobData,
} from "./lib/topic-projection";
import {
  TOPIC_ENTITY_TYPE,
  TOPIC_PROJECTION_ID,
  TOPIC_PROJECTION_JOB_TYPE,
  TOPICS_JOB_SOURCE,
  TOPICS_PLUGIN_ID,
  TOPICS_SOURCE_BATCH_DEDUP_KEY,
} from "./lib/constants";
import packageJson from "../package.json";

const topicAdapter = new TopicAdapter();

export class TopicsPlugin extends EntityPlugin<
  TopicEntity,
  TopicsPluginConfig
> {
  readonly entityType = TOPIC_ENTITY_TYPE;
  readonly schema = topicEntitySchema;
  readonly adapter = topicAdapter;

  declare protected config: TopicsPluginConfig;
  private readonly sourceBatch = new TopicSourceBatchBuffer();

  constructor(config: Partial<TopicsPluginConfig> = {}) {
    super(TOPICS_PLUGIN_ID, packageJson, config, topicsPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 0.5, projectionSource: false };
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

  protected override getDerivedEntityProjections(
    context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    if (!this.config.enableAutoExtraction) return [];

    return [
      {
        id: TOPIC_PROJECTION_ID,
        targetType: TOPIC_ENTITY_TYPE,
        job: {
          type: TOPIC_PROJECTION_JOB_TYPE,
          handler: createTopicProjectionHandler({
            context,
            logger: this.logger,
            config: this.config,
            extractAllTopics: () => this.extractAllTopics(context),
            rebuildAllTopics: () => this.rebuildAllTopics(context),
            sourceBatch: this.sourceBatch,
            isEntityPublished: (entity) => this.isEntityPublished(entity),
          }),
        },
        initialSync: {
          shouldEnqueue: async () =>
            !(await hasPersistedTargets(context, TOPIC_ENTITY_TYPE)),
          jobData: { mode: "derive", reason: "initial-sync" },
          jobOptions: getInitialProjectionJobOptions(),
        },
        sourceChange: {
          sourceTypes: this.config.includeEntityTypes,
          requireInitialSync: true,
          jobData: (payload): TopicProjectionJobData | null => {
            const entity = payload.entity;
            if (!entity) return null;
            if (
              !this.shouldProcessEntityType(
                entity.entityType,
                context.entityService,
              )
            ) {
              return null;
            }
            if (!this.isEntityPublished(entity)) return null;
            this.sourceBatch.add({
              entityId: entity.id,
              entityType: entity.entityType,
              contentHash: entity.contentHash,
            });
            return { mode: "source-batch" };
          },
          jobOptions: () => ({
            priority: 5,
            source: TOPICS_JOB_SOURCE,
            delayMs: this.config.sourceChangeBatchDelayMs,
            deduplication: "skip",
            deduplicationKey: TOPICS_SOURCE_BATCH_DEDUP_KEY,
            metadata: {
              operationType: "data_processing" as const,
              operationTarget: "topic-source-batch",
              pluginId: TOPICS_PLUGIN_ID,
            },
          }),
        },
      },
    ];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Insights
    context.insights.register(
      "topic-distribution",
      createTopicDistributionInsight(),
    );

    // Dashboard widget
    registerTopicsDashboardWidget({ context, pluginId: this.id });

    // Eval handlers
    registerTopicEvalHandlers({
      context,
      logger: this.logger,
      config: this.config,
    });
  }

  // ── Public helpers (used by tests) ──

  public hasRunInitialDerivation(): boolean {
    return (
      this.getDerivedEntityProjectionController(
        TOPIC_PROJECTION_ID,
      )?.hasQueuedInitialSync() ?? false
    );
  }

  public shouldProcessEntityType(
    entityType: string,
    entityService: {
      getEntityTypeConfig: (type: string) => EntityTypeConfig;
    },
  ): boolean {
    if (entityType === TOPIC_ENTITY_TYPE) return false;
    if (!this.config.includeEntityTypes.includes(entityType)) return false;
    return (
      entityService.getEntityTypeConfig(entityType).projectionSource !== false
    );
  }

  public isEntityPublished(entity: BaseEntity): boolean {
    const metadata = entity.metadata as Record<string, unknown>;
    const status = metadata["status"];
    if (status === undefined || status === null) return true;
    if (typeof status !== "string") return false;
    return this.config.extractableStatuses.includes(status);
  }

  // ── Projection internals ──

  private async extractAllTopics(context: EntityPluginContext): Promise<void> {
    await extractAllTopics({
      context,
      logger: this.logger,
      config: this.config,
      shouldProcessEntityType: (entityType) =>
        this.shouldProcessEntityType(entityType, context.entityService),
      isEntityPublished: (entity) => this.isEntityPublished(entity),
    });
  }

  private async rebuildAllTopics(context: EntityPluginContext): Promise<void> {
    await rebuildAllTopics({
      context,
      logger: this.logger,
      config: this.config,
      shouldProcessEntityType: (entityType) =>
        this.shouldProcessEntityType(entityType, context.entityService),
      isEntityPublished: (entity) => this.isEntityPublished(entity),
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
