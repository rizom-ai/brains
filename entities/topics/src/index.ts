import {
  defineServicePlugin,
  defineSubscription,
  SYSTEM_CHANNELS,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { topicsPluginConfigSchema } from "./schemas/config";
import { topic } from "./topic-entity";
import { includesTopicSourceType } from "./lib/topic-source-policy";
import { createRankedTopicJob } from "./lib/ranked-topic-extraction";
import { topicEvalHandlers } from "./lib/eval-handlers";
import {
  ENTITY_CHANNELS,
  TOPIC_TITLES_MESSAGE,
  topicTitlesResponseSchema,
} from "@brains/contracts";
import { getTopicTitle } from "./lib/topic-presenter";

/**
 * Topics owns its derived entity and independent ranked maintenance job.
 * Entity events wake maintenance without inheriting a projection's budget.
 */
export const topics: ServicePackageDefinition<typeof topicsPluginConfigSchema> =
  defineServicePlugin(
    {
      id: "topics",
      config: topicsPluginConfigSchema,
      entities: [topic],
      setup: ({ config, runtimeState, jobs }) => ({
        extraction: createRankedTopicJob(
          config,
          { scoped: runtimeState },
          jobs,
        ),
      }),
    },
    {
      jobs: ({ state }) => [state.extraction],
      insights: ({ config }) => ({
        "topic-distribution": async ({
          entities,
          projectionSourceTypes,
          visibilityScope,
        }): Promise<Record<string, unknown>> => {
          const entries = await entities.listEntities({
            entityType: topic.type,
            options: { filter: { visibilityScope } },
          });
          const distribution = entries.map((entry) => ({
            topic: entry.id,
            title: getTopicTitle(entry),
          }));
          if (distribution.length > 0) return { topics: distribution };
          const counts = await Promise.all(
            projectionSourceTypes
              .filter((type) => includesTopicSourceType(type, config, {}))
              .map((entityType) =>
                entities.count({
                  entityType,
                  options: {
                    filter: { visibilityScope },
                    ...(visibilityScope === "public"
                      ? { publishedOnly: true }
                      : {}),
                  },
                }),
              ),
          );
          const sourceEntities = counts.reduce((sum, count) => sum + count, 0);
          if (sourceEntities === 0) return { topics: [] };
          const reason = config.enableAutoExtraction
            ? "Topics have not been extracted yet; extraction runs in the background."
            : "Automatic topic extraction is off.";
          return {
            topics: [],
            unextracted: {
              sourceEntities,
              hint: `${reason} ${sourceEntities} visible ${sourceEntities === 1 ? "entity exists" : "entities exist"}: use system_search to answer from the content itself.`,
            },
          };
        },
      }),
      subscriptions: ({ config, state, jobs }) => [
        ...(config.enableAutoExtraction
          ? [
              ...[
                ENTITY_CHANNELS.created,
                ENTITY_CHANNELS.updated,
                ENTITY_CHANNELS.deleted,
              ].map((channel) =>
                defineSubscription({
                  topic: channel,
                  execution: "all-roles",
                  payload: z.unknown(),
                  handle: async ({ payload, entities }): Promise<void> => {
                    const event = z
                      .object({ entityType: z.string() })
                      .safeParse(payload);
                    if (
                      !event.success ||
                      !entities.getEntityTypes().includes(event.data.entityType)
                    )
                      return;
                    const type = event.data.entityType;
                    if (
                      includesTopicSourceType(
                        type,
                        config,
                        entities.getSourcePolicy(type),
                      )
                    ) {
                      await jobs.enqueue(
                        state.extraction.definition,
                        {},
                        { delayMs: config.sourceChangeBatchDelayMs },
                      );
                    }
                  },
                }),
              ),
              defineSubscription({
                topic: SYSTEM_CHANNELS.startupContentSettled,
                payload: z.unknown(),
                handle: async (): Promise<void> => {
                  await jobs.enqueue(state.extraction.definition, {});
                },
              }),
            ]
          : []),
        defineSubscription({
          topic: TOPIC_TITLES_MESSAGE,
          payload: z.unknown(),
          response: topicTitlesResponseSchema,
          handle: async ({ entities }) => {
            const entries = await entities.list(topic, {
              filter: { visibilityScope: "public" },
            });
            return {
              titles: entries
                .map(getTopicTitle)
                .sort((left, right) => left.localeCompare(right))
                .slice(0, 20),
            };
          },
        }),
      ],
      evals: ({ config, template }) =>
        topicEvalHandlers(config, template("votes")),
    },
  );

export default topics;

export type {
  TopicsPluginConfig,
  TopicsPluginConfigInput,
} from "./schemas/config";
export type { TopicEntity } from "./types";
export {
  buildTopicAtprotoRecord,
  createTopicAtprotoProjection,
} from "./atproto-projection";
