import {
  collectionMembersContract,
  collectionTypesContract,
  topicSourceTypesContract,
  topicTitlesContract,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
  internalFullScope,
  serviceRuntime,
  withJobHandlers,
  type ServiceRuntime,
  entitiesRestatedChannel,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "./schemas/config";
import { topic } from "./topic-entity";
import { carryRestatedSources } from "./lib/restated-sources";
import { getTopicTitle } from "./lib/topic-presenter";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicMergeSynthesisTemplate } from "./templates/merge-synthesis-template";
import { topicListTemplate } from "./templates/topic-list";
import { topicDetailTemplate } from "./templates/topic-detail";
import { topicVoteTemplate } from "./templates/vote-template";
import { topicDescriptionTemplate } from "./templates/description-template";
import { topicsDataSource } from "./datasources/topics-datasource";
import { createTopicDistributionReport } from "./reports/topic-distribution";
import { registerTopicsDashboardWidget } from "./lib/dashboard-widget";
import { registerTopicEvalHandlers } from "./lib/eval-handlers";
import {
  enqueueTopicExtraction,
  rankedTopicExtractionJob,
} from "./lib/ranked-topic-extraction";
import {
  isTopicSourceEligible,
  isTopicSourceType,
  topicSourceTypes,
} from "./lib/topic-source-policy";
import {
  storeEntries,
  topicExtractionStores,
  topicVotePromptVersion,
} from "./lib/topic-extraction-run";
import {
  countTopicSources,
  topicSourcesBySlug,
} from "./lib/topic-source-counts";
import { answerTopicMembers } from "./lib/topic-members";
import { readVisibleSources } from "./lib/topic-visible-sources";
import { topicsContextOf, type TopicsContext } from "./lib/topics-context";
import { TOPIC_ENTITY_TYPE } from "./lib/constants";

/** Runtime-state marker: the retired topics projection rule released its entities. */
const PROJECTION_OWNERSHIP_RELEASED = "projection-ownership-released";

/**
 * Release the removed projection rule's topics before the shell reconciles
 * projection orphans, once per brain. Needed even with extraction off.
 */
async function releaseRetiredProjectionOwnership(
  context: TopicsContext,
): Promise<void> {
  const migrations = context.runtimeState.scoped({
    namespace: "topics.migrations",
    schema: z.literal(true),
  });
  if (await migrations.get(PROJECTION_OWNERSHIP_RELEASED)) return;
  const topics = await context.entityService.listEntities({
    entityType: TOPIC_ENTITY_TYPE,
    options: {
      filter: {
        visibilityScope: internalFullScope(
          "one-shot projection ownership migration",
        ),
      },
    },
  });
  for (const stored of topics) {
    await context.entityService.releaseProjectionOwnership({
      entityType: TOPIC_ENTITY_TYPE,
      id: stored.id,
    });
  }
  await migrations.set(PROJECTION_OWNERSHIP_RELEASED, true);
}

/** Whether a type's records are topic sources, by the type's config. */
function shouldProcessEntityType(
  context: TopicsContext,
  config: TopicsPluginConfig,
  entityType: string,
): boolean {
  return isTopicSourceType(
    entityType,
    config,
    context.entityService.getEntityTypeConfig(entityType),
  );
}

/** What wakes extraction, in the processes the class heard it. */
function listenForSources(
  runtime: ServiceRuntime,
  context: TopicsContext,
  config: TopicsPluginConfig,
): void {
  for (const channel of [
    entityCreatedChannel,
    entityUpdatedChannel,
    entityDeletedChannel,
  ]) {
    // Execution listeners run in both processes, exactly once: worker
    // imports need the same trigger as ordinary web-side mutations. A
    // refused enqueue is retried until the queue admits it: the event is
    // not delivered again, and one keyed retry stands for all of them.
    runtime.listen(
      channel,
      async ({ payload: change }) => {
        if (!shouldProcessEntityType(context, config, change.entityType))
          return;
        await runtime.retries.run(
          () =>
            enqueueTopicExtraction(context, config.sourceChangeBatchDelayMs),
          "queue a topic extraction",
          "topics:extract",
        );
      },
      { mode: "execution" },
    );
  }
  runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
    await runtime.retries.run(
      () => enqueueTopicExtraction(context),
      "queue a topic extraction",
      "topics:extract",
    );
  });
}

/**
 * Topics: the recurring themes of the brain's content, extracted in the
 * background by a ranked, leased job, kept as the topic type, rendered by
 * the topic templates through the topics data source, published to AT
 * Protocol, reported to system_analytics and listed on the Dashboard.
 * Installed under the topics class's plugin id, so its templates, data
 * source, job, evals and runtime state keep their topics names.
 */
export const topicsPackage: ServicePackageDefinition<
  typeof topicsPluginConfigSchema
> = withJobHandlers(
  defineServicePlugin({
    id: "topics",
    config: topicsPluginConfigSchema,
    entities: [topic],
    setup: async (setupContext): Promise<Record<never, never>> => {
      const runtime = serviceRuntime(setupContext);
      const { config } = setupContext;
      const context = topicsContextOf(runtime);
      for (const [name, template] of Object.entries({
        extraction: topicExtractionTemplate,
        votes: topicVoteTemplate,
        description: topicDescriptionTemplate,
        "merge-synthesis": topicMergeSynthesisTemplate,
        "topic-list": topicListTemplate,
        "topic-detail": topicDetailTemplate,
      })) {
        runtime.template(name, template);
      }
      runtime.dataSource(
        topicsDataSource(runtime.logger.child("TopicsDataSource")),
      );
      await releaseRetiredProjectionOwnership(context);
      // A row the shell's quiet rewrite restated keeps its vote under its
      // new hash, before the extraction startup queues reads the corpus.
      runtime.listen(entitiesRestatedChannel, async ({ payload }) => {
        await carryRestatedSources(
          topicExtractionStores(context),
          payload.entities,
        );
      });
      if (config.enableAutoExtraction)
        listenForSources(runtime, context, config);

      // What the brain's public work is about, for other plugins: for
      // example the site's subjects when a visitor's question is screened.
      if (!runtime.executionOnly)
        runtime.answer(topicTitlesContract, async () => {
          const topics = await context.entityService.listEntities({
            entityType: TOPIC_ENTITY_TYPE,
            options: { filter: { visibilityScope: "public" } },
          });
          const titles = topics
            .map((stored) => getTopicTitle(stored))
            .sort((a, b) => a.localeCompare(b))
            .slice(0, 20);
          return { titles };
        });
      // Which types topics are drawn from, for other plugins: a map of the
      // corpus measures its territories against the same sources. Answered
      // in every process: the worker builds the site the map is drawn on.
      runtime.answer(
        topicSourceTypesContract,
        async () => ({
          types: topicSourceTypes(context.entityService, config),
        }),
        { everyProcess: true },
      );
      const extractionStores = topicExtractionStores(context);
      // Which entries belong to a topic, for Studio: the visible sources
      // whose current votes support it, counted as the distribution counts.
      if (!runtime.executionOnly) {
        runtime.answer(collectionTypesContract, async () => ({
          types: [TOPIC_ENTITY_TYPE],
        }));
        runtime.answer(collectionMembersContract, ({ request }) =>
          answerTopicMembers(request, {
            listTopics: async (visibilityScope) =>
              (
                await context.entityService.listEntities({
                  entityType: TOPIC_ENTITY_TYPE,
                  options: { filter: { visibilityScope } },
                })
              ).map((stored) => ({
                id: stored.id,
                title: getTopicTitle(stored),
              })),
            readSources: async (visibilityScope) =>
              (
                await readVisibleSources(
                  context.entityService,
                  {
                    isSourceType: (type) =>
                      isTopicSourceType(
                        type,
                        config,
                        context.entityService.getEntityTypeConfig(type),
                      ),
                    isEligibleSource: (entity: BaseEntity) =>
                      isTopicSourceEligible(entity, config),
                  },
                  visibilityScope,
                )
              ).filter((source) => source.eligible),
            sourcesBySlug: async (sources) => {
              const [votes, aliases, promptVersion] = await Promise.all([
                storeEntries(extractionStores.votes),
                storeEntries(extractionStores.aliases),
                topicVotePromptVersion(context),
              ]);
              return topicSourcesBySlug({
                sources,
                votes,
                aliases,
                promptVersion,
                config,
              }).bySlug;
            },
          }),
        );
      }
      runtime.analyticsReport(
        createTopicDistributionReport({
          isSourceType: (type, entityService) =>
            isTopicSourceType(
              type,
              config,
              entityService.getEntityTypeConfig(type),
            ),
          isEligibleSource: (entity: BaseEntity) =>
            isTopicSourceEligible(entity, config),
          autoExtraction: config.enableAutoExtraction,
          // Counted from extraction's votes, read as extraction reads them.
          countSources: async (sources) => {
            const [votes, aliases, promptVersion] = await Promise.all([
              storeEntries(extractionStores.votes),
              storeEntries(extractionStores.aliases),
              topicVotePromptVersion(context),
            ]);
            return countTopicSources({
              sources,
              votes,
              aliases,
              promptVersion,
              config,
            });
          },
        }),
      );
      // The topic list on the Dashboard. The knowledge map is its own
      // package, @brains/knowledge-map.
      registerTopicsDashboardWidget(runtime);
      registerTopicEvalHandlers({
        context: {
          ...context,
          eval: {
            registerHandler: (handlerId, handler): void =>
              runtime.evalHandler(handlerId, handler),
          },
        },
        logger: runtime.logger,
        config,
      });
      return {};
    },
  }),
  (slotContext) =>
    slotContext.config.enableAutoExtraction
      ? [
          rankedTopicExtractionJob(
            topicsContextOf(serviceRuntime(slotContext)),
            slotContext.config,
            serviceRuntime(slotContext).logger,
          ),
        ]
      : [],
);

export default topicsPackage;
