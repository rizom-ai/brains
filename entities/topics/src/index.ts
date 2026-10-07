import {
  defineServicePlugin,
  defineSubscription,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { topicsPluginConfigSchema } from "./schemas/config";
import { topic } from "./topic-entity";
import {
  createTopicProjectionRule,
  includesSourceType,
} from "./lib/topic-wave-rule";
import { topicEvalHandlers } from "./lib/eval-handlers";
import {
  TOPIC_TITLES_MESSAGE,
  topicTitlesResponseSchema,
} from "@brains/contracts";
import { getTopicTitle } from "./lib/topic-presenter";

/**
 * Topics: a derived entity plus the wave that derives it.
 *
 * One package rather than two because the rule and the entity are the same
 * capability seen from either end — the rule has no meaning without the
 * type it writes, and the type is never authored by hand.
 */
export const topics: ServicePackageDefinition<typeof topicsPluginConfigSchema> =
  defineServicePlugin(
    {
      id: "topics",
      config: topicsPluginConfigSchema,
      entities: [topic],
    },
    {
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
              .filter((type) => includesSourceType(type, config, true))
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
      subscriptions: () => [
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
      // Extraction is opt-out, and every threshold it derives with comes from
      // config, so whether the rule exists at all is a configured question.
      projectionRules: ({ config, template }) =>
        config.enableAutoExtraction
          ? [createTopicProjectionRule(config, template("extraction"))]
          : [],
      evals: ({ config, template }) =>
        topicEvalHandlers(config, template("extraction")),
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
