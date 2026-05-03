import type { BaseEntity } from "@brains/plugins";
import { truncateText } from "@brains/utils";
import type { TopicDetailData } from "../templates/topic-detail/schema";
import type { TopicSummary } from "../templates/topic-list/schema";
import { TopicAdapter } from "./topic-adapter";

const adapter = new TopicAdapter();

export interface TopicContentProjection {
  id: string;
  title: string;
  content: string;
}

export interface TopicContentProjectionWithMetadata extends TopicContentProjection {
  metadata: BaseEntity["metadata"];
}

export function getTopicTitle(entity: BaseEntity): string {
  return adapter.parseTopicBody(entity.content).title;
}

export function toTopicSummary(
  entity: BaseEntity,
  summaryLength = 200,
): TopicSummary {
  const parsed = adapter.parseTopicBody(entity.content);
  return {
    id: entity.id,
    title: parsed.title,
    summary: truncateText(parsed.content, summaryLength),
    created: entity.created,
    updated: entity.updated,
  };
}

export function toTopicDetail(entity: BaseEntity): TopicDetailData {
  const parsed = adapter.parseTopicBody(entity.content);
  return {
    id: entity.id,
    title: parsed.title,
    content: parsed.content,
    created: entity.created,
    updated: entity.updated,
  };
}

export function toTopicContentProjection(
  entity: BaseEntity,
): TopicContentProjection {
  const parsed = adapter.parseTopicBody(entity.content);
  return {
    id: entity.id,
    title: parsed.title,
    content: parsed.content,
  };
}

export function toTopicContentProjectionWithMetadata(
  entity: BaseEntity,
): TopicContentProjectionWithMetadata {
  return {
    ...toTopicContentProjection(entity),
    metadata: entity.metadata,
  };
}
