import {
  atprotoProvenance,
  defineAtprotoProjection,
} from "@brains/atproto-contracts";
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
  pageUrl,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainTopicRecord> {
  const topic = topicEntitySchema.parse(entity);
  const parsed = topicAdapter.parseTopicBody(topic.content);

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
