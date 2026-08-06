import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
  type DataSource,
  type Template,
  type BaseEntity,
  type ProjectionRule,
} from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { z } from "@brains/utils/zod";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
  type TopicsPluginConfigInput,
} from "./schemas/config";
import { TopicAdapter } from "./lib/topic-adapter";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicMergeSynthesisTemplate } from "./templates/merge-synthesis-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { TopicsDataSource } from "./datasources/topics-datasource";
import { KnowledgeMapDataSource } from "./datasources/knowledge-map-datasource";
import { getKnowledgeMapTemplate } from "./templates/knowledge-map-template";
import { topicEntitySchema, type TopicEntity } from "./schemas/topic";
import { createTopicDistributionInsight } from "./insights/topic-distribution";
import { registerTopicsDashboardWidget } from "./lib/dashboard-widget";
import { registerKnowledgeMapDashboardWidget } from "./lib/knowledge-map-widget";
import { registerTopicEvalHandlers } from "./lib/eval-handlers";
import { createTopicProjectionRule } from "./lib/topic-wave-rule";
import { TOPIC_ENTITY_TYPE, TOPICS_PLUGIN_ID } from "./lib/constants";
import { createTopicAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

interface SourceMetadata {
  status?: unknown;
}

const topicAdapter: TopicAdapter = new TopicAdapter();
const sourceMetadataSchema: z.ZodType<SourceMetadata, unknown> = z.looseObject({
  status: z.unknown().optional(),
});

export class TopicsPlugin extends EntityPlugin<
  TopicEntity,
  TopicsPluginConfig,
  TopicsPluginConfigInput
> {
  readonly entityType: typeof TOPIC_ENTITY_TYPE = TOPIC_ENTITY_TYPE;
  readonly schema: typeof topicEntitySchema = topicEntitySchema;
  readonly adapter: TopicAdapter = topicAdapter;
  private unregisterAtprotoProjection: (() => void) | undefined;

  declare protected config: TopicsPluginConfig;

  constructor(config: TopicsPluginConfigInput = {}) {
    super(TOPICS_PLUGIN_ID, packageJson, config, topicsPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      weight: 0.5,
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      extraction: topicExtractionTemplate,
      "merge-synthesis": topicMergeSynthesisTemplate,
      "topic-list": topicListTemplate,
      "topic-detail": topicDetailTemplate,
      "knowledge-map": getKnowledgeMapTemplate(),
    };
  }

  protected override getDataSources(): DataSource[] {
    return [
      new TopicsDataSource(this.logger.child("TopicsDataSource")),
      new KnowledgeMapDataSource(),
    ];
  }

  protected override getProjectionRules(
    _context: EntityPluginContext,
  ): ProjectionRule[] {
    return this.config.enableAutoExtraction
      ? [createTopicProjectionRule(this.config)]
      : [];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Insights
    context.insights.register(
      "topic-distribution",
      createTopicDistributionInsight(),
    );

    // Dashboard widgets: the topic list and the knowledge map
    registerTopicsDashboardWidget({ context });
    registerKnowledgeMapDashboardWidget({ context });

    // Eval handlers
    registerTopicEvalHandlers({
      context,
      logger: this.logger,
      config: this.config,
    });

    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createTopicAtprotoProjection(),
      );
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }

  // ── Public helpers (used by tests) ──

  public shouldProcessEntityType(
    entityType: string,
    entityService: {
      getEntityTypeConfig: (type: string) => EntityTypeConfig;
    },
  ): boolean {
    if (entityType === TOPIC_ENTITY_TYPE) return false;
    if (this.config.excludeEntityTypes.includes(entityType)) return false;
    if (
      !this.config.includeEntityTypes.includes("*") &&
      !this.config.includeEntityTypes.includes(entityType)
    ) {
      return false;
    }
    return (
      entityService.getEntityTypeConfig(entityType).projectionSource !== false
    );
  }

  public isEntityPublished(entity: BaseEntity): boolean {
    const parsed = sourceMetadataSchema.safeParse(entity.metadata);
    const status = parsed.success ? parsed.data.status : undefined;
    if (status === undefined || status === null) return true;
    if (typeof status !== "string") return false;
    return this.config.extractableStatuses.includes(status);
  }
}

export default TopicsPlugin;

export function topicsPlugin(
  config: TopicsPluginConfigInput = {},
): TopicsPlugin {
  return new TopicsPlugin(config);
}

export type {
  TopicsPluginConfig,
  TopicsPluginConfigInput,
} from "./schemas/config";
export type { TopicEntity } from "./types";
export {
  buildTopicAtprotoRecord,
  createTopicAtprotoProjection,
} from "./atproto-projection";
