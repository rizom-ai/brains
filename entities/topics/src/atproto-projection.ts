import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
  defineAtprotoProjection,
} from "@brains/atproto-contracts";
import type {
  AtprotoBrainTopicRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import type { EntityAtprotoProjection } from "@brains/sdk/entities";
import { topicDocument } from "./lib/topic-document";
import { topicEntitySchema, type TopicEntity } from "./schemas/topic";

export async function buildTopicAtprotoRecord({
  entity,
  config,
  pageUrl,
}: Pick<
  AtprotoProjectionBuildInput,
  "entity" | "config" | "pageUrl"
>): Promise<AtprotoBrainTopicRecord> {
  const topic = topicEntitySchema.parse(entity);
  const parsed = topicDocument.parseTopicBody(topic.content);

  return {
    $type: "ai.rizom.brain.topic",
    title: parsed.title,
    body: parsed.content,
    format: "text/markdown",
    ...atprotoProvenance({ config, pageUrl }, topic),
  };
}

export function createTopicAtprotoProjection(): AtprotoProjection<AtprotoBrainTopicRecord> {
  return defineAtprotoProjection({
    entityType: "topic",
    collection: "ai.rizom.brain.topic",
    buildRecord: buildTopicAtprotoRecord,
  });
}

/**
 * Topic records, under the canonical topic lexicon and unvalidated by the
 * PDS, as the topics class registered them: every public topic.
 */
export const topicAtproto: EntityAtprotoProjection<TopicEntity> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.topic"],
  validate: false,
  buildRecord: ({ entity, config, pageUrl }) =>
    buildTopicAtprotoRecord({
      entity,
      config,
      ...(pageUrl !== undefined && { pageUrl }),
    }),
};
