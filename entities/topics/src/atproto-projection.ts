import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoBrainTopicRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { TopicAdapter } from "./lib/topic-adapter";
import { topicEntitySchema } from "./schemas/topic";

const topicAdapter = new TopicAdapter();

export async function buildTopicAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainTopicRecord> {
  const topic = topicEntitySchema.parse(entity);
  const parsed = topicAdapter.parseTopicBody(topic.content);

  return {
    $type: "ai.rizom.brain.topic",
    title: parsed.title,
    body: parsed.content,
    format: "text/markdown",
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "topic",
    sourceEntityId: topic.id,
    createdAt: topic.created,
    ...(topic.updated && { updatedAt: topic.updated }),
  };
}

export function createTopicAtprotoProjection(): AtprotoProjection<AtprotoBrainTopicRecord> {
  return {
    entityType: "topic",
    collection: "ai.rizom.brain.topic",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.topic"],
    validate: false,
    buildRecord: buildTopicAtprotoRecord,
  };
}
