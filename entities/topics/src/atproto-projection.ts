import { parseAtprotoLexicon } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { TopicAdapter } from "./lib/topic-adapter";
import { topicEntitySchema } from "./schemas/topic";
import topicLexicon from "../lexicons/ai.rizom.brain.topic.json";

const topicAdapter = new TopicAdapter();

export interface TopicAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.topic";
  title: string;
  body: string;
  format: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "topic";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildTopicAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<TopicAtprotoRecord> {
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

export function createTopicAtprotoProjection(): AtprotoProjection<TopicAtprotoRecord> {
  return {
    entityType: "topic",
    collection: "ai.rizom.brain.topic",
    lexicon: parseAtprotoLexicon(topicLexicon),
    validate: false,
    buildRecord: buildTopicAtprotoRecord,
  };
}
