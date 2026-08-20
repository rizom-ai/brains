import { canonicalAtprotoLexicons } from "@brains/sdk/entities";
import type {
  AtprotoBrainTopicRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/sdk/entities";
import { parseTopicBody } from "./lib/topic-body";
import { topicEntitySchema } from "./schemas/topic";

export async function buildTopicAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainTopicRecord> {
  const topic = topicEntitySchema.parse(entity);
  const parsed = parseTopicBody(topic.content);

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
