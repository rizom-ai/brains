import type { TopicEntity } from "../../src/types";
import type { BaseEntity } from "@brains/plugins";
import { computeContentHash } from "@brains/utils";

/**
 * Create a mock TopicEntity with computed contentHash
 */
export function createMockTopicEntity(
  overrides: Partial<Omit<TopicEntity, "contentHash">> & { content: string },
): TopicEntity {
  const content = overrides.content;
  return {
    id: overrides.id ?? "test-topic",
    entityType: "topic",
    content,
    contentHash: computeContentHash(content),
    created: overrides.created ?? new Date().toISOString(),
    updated: overrides.updated ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {},
  };
}

/**
 * Create a mock BaseEntity with computed contentHash
 * Useful for testing topic extraction from various entity types
 */
export function createMockBaseEntity(
  overrides: Partial<Omit<BaseEntity, "contentHash">> & {
    content: string;
    entityType: string;
  },
): BaseEntity {
  const content = overrides.content;
  return {
    id: overrides.id ?? "test-entity",
    entityType: overrides.entityType,
    content,
    contentHash: computeContentHash(content),
    created: overrides.created ?? new Date().toISOString(),
    updated: overrides.updated ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {},
  };
}
