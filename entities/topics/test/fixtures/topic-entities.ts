import type { TopicEntity } from "../../src/types";
import type { BaseEntity } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";

/**
 * Create a mock TopicEntity with computed contentHash
 */
export function createMockTopicEntity(
  overrides: Partial<Omit<TopicEntity, "contentHash">> & { content: string },
): TopicEntity {
  return createTestEntity<TopicEntity>("topic", {
    id: overrides.id ?? "test-topic",
    content: overrides.content,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? {},
  });
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
  return createTestEntity<BaseEntity>(overrides.entityType, {
    id: overrides.id ?? "test-entity",
    content: overrides.content,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? {},
  });
}
