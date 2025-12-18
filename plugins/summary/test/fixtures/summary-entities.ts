/**
 * Test fixtures for summary entities
 */

import type { SummaryEntity, SummaryMetadata } from "../../src/schemas/summary";
import { computeContentHash } from "@brains/utils";

/**
 * Default metadata for test summaries
 */
export const defaultSummaryMetadata: SummaryMetadata = {
  conversationId: "test-conv",
  channelName: "Test Channel",
  channelId: "test-channel",
  interfaceType: "cli",
  entryCount: 1,
  totalMessages: 10,
};

/**
 * Create a mock summary entity with contentHash automatically computed
 */
export function createMockSummaryEntity(
  overrides: Partial<Omit<SummaryEntity, "contentHash">> & { content: string },
): SummaryEntity {
  const content = overrides.content;
  return {
    id: overrides.id ?? "test-summary",
    entityType: "summary",
    content,
    contentHash: computeContentHash(content),
    created: overrides.created ?? "2025-01-01T00:00:00Z",
    updated: overrides.updated ?? "2025-01-01T00:00:00Z",
    metadata: overrides.metadata ?? defaultSummaryMetadata,
  };
}
