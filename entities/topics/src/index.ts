import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
  type DataSource,
  type Template,
  type BaseEntity,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import {
  ENTITY_CHANNELS,
  TOPIC_TITLES_MESSAGE,
  type TopicTitlesResponse,
} from "@brains/contracts";
import { getTopicTitle } from "./lib/topic-presenter";
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
import {
  createRankedTopicJobHandler,
  enqueueTopicExtraction,
} from "./lib/ranked-topic-extraction";
import {
  includesTopicSourceType,
  topicSourcePolicy,
} from "./lib/topic-source-policy";
import { topicVoteTemplate } from "./templates/vote-template";
import { topicDescriptionTemplate } from "./templates/description-template";
import { TOPIC_ENTITY_TYPE, TOPICS_PLUGIN_ID } from "./lib/constants";
import { createTopicAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

interface SourceMetadata {
  status?: unknown;
}

/** Runtime-state marker: the retired topics projection rule released its entities. */
const PROJECTION_OWNERSHIP_RELEASED = "projection-ownership-released";
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
      votes: topicVoteTemplate,
      description: topicDescriptionTemplate,
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

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Release the removed rule before the shell reconciles projection orphans,
    // once per brain. This is needed even when extraction has been disabled.
    const migrations = context.runtimeState.scoped({
      namespace: "topics.migrations",
      schema: z.literal(true),
    });
    if (!(await migrations.get(PROJECTION_OWNERSHIP_RELEASED))) {
      for (const topic of await context.entityService.listEntities({
        entityType: TOPIC_ENTITY_TYPE,
        options: { filter: { visibilityScope: "restricted" } },
      })) {
        await context.entityService.releaseProjectionOwnership({
          entityType: TOPIC_ENTITY_TYPE,
          id: topic.id,
        });
      }
      await migrations.set(PROJECTION_OWNERSHIP_RELEASED, true);
    }
    if (this.config.enableAutoExtraction) {
      context.jobs.registerHandler(
        "topics:extract",
        createRankedTopicJobHandler(context, this.config, this.logger),
      );
      const eventSchema = z.object({ entityType: z.string() });
      for (const channel of [
        ENTITY_CHANNELS.created,
        ENTITY_CHANNELS.updated,
        ENTITY_CHANNELS.deleted,
      ]) {
        // Execution subscriptions run in both processes, exactly once: worker
        // imports need the same trigger as ordinary web-side mutations.
        context.messaging.subscribeExecution(channel, async (message) => {
          const event = eventSchema.safeParse(message.payload);
          if (
            event.success &&
            this.shouldProcessEntityType(
              event.data.entityType,
              context.entityService,
            )
          ) {
            await enqueueTopicExtraction(
              context,
              this.config.sourceChangeBatchDelayMs,
            );
          }
          return { success: true };
        });
      }
      context.messaging.subscribe(
        SYSTEM_CHANNELS.startupContentSettled,
        async () => {
          await enqueueTopicExtraction(context);
          return { success: true };
        },
      );
    }

    // What the brain's public work is about, for other plugins: for example
    // the site's subjects when a visitor's question is screened.
    context.messaging.subscribe<unknown, TopicTitlesResponse>(
      TOPIC_TITLES_MESSAGE,
      async () => {
        const topics = await context.entityService.listEntities(
          {
            entityType: TOPIC_ENTITY_TYPE,
            options: { filter: { visibilityScope: "public" } },
          },
          topicEntitySchema,
        );
        const titles = topics
          .map((topic) => getTopicTitle(topic))
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 20);
        return { success: true, data: { titles } };
      },
    );
    // Insights
    context.insights.register(
      "topic-distribution",
      createTopicDistributionInsight({
        isSourceType: (type, entityService) =>
          this.shouldProcessEntityType(type, entityService),
        autoExtraction: this.config.enableAutoExtraction,
      }),
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
    const typeConfig = entityService.getEntityTypeConfig(entityType);
    return (
      includesTopicSourceType(entityType, this.config, typeConfig) &&
      topicSourcePolicy(entityType, this.config, typeConfig).weight > 0
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
export {
  buildKnowledgeMapData,
  knowledgeMapDataSchema,
  type KnowledgeMapData,
  type KnowledgeMapDataContext,
} from "./lib/knowledge-map-data";
