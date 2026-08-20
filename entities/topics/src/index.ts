import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { topicsPluginConfigSchema } from "./schemas/config";
import { topic } from "./topic-entity";
import { createTopicProjectionRule } from "./lib/topic-wave-rule";
import { topicEvalHandlers } from "./lib/eval-handlers";

/**
 * Topics: a derived entity plus the wave that derives it.
 *
 * One package rather than two because the rule and the entity are the same
 * capability seen from either end — the rule has no meaning without the
 * type it writes, and the type is never authored by hand.
 */
export const topics: ServicePackageDefinition<typeof topicsPluginConfigSchema> =
  defineServicePlugin({
    id: "topics",
    config: topicsPluginConfigSchema,
    entities: [topic],
    // Extraction is opt-out, and every threshold it derives with comes from
    // config, so whether the rule exists at all is a configured question.
    projectionRules: ({ config, template }) =>
      config.enableAutoExtraction
        ? [createTopicProjectionRule(config, template("extraction"))]
        : [],
    evals: ({ config, template }) =>
      topicEvalHandlers(config, template("extraction")),
  });

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
