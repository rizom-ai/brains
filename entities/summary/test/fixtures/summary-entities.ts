import type { SummaryEntity, SummaryMetadata } from "../../src/schemas/summary";
import { createTestEntity } from "@brains/test-utils";

export const defaultSummaryMetadata: SummaryMetadata = {
  conversationId: "test-conv",
  channelName: "Test Channel",
  channelId: "test-channel",
  interfaceType: "cli",
  timeRange: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T00:10:00.000Z",
  },
  entryCount: 1,
  messageCount: 2,
  sourceHash: "hash-123",
  projectionVersion: 1,
};

export function createMockSummaryEntity(
  overrides: Partial<Omit<SummaryEntity, "contentHash">> & { content: string },
): SummaryEntity {
  return createTestEntity<SummaryEntity>("summary", {
    id: overrides.id ?? "test-conv",
    content: overrides.content,
    created: overrides.created ?? "2026-01-01T00:00:00.000Z",
    updated: overrides.updated ?? "2026-01-01T00:10:00.000Z",
    metadata: overrides.metadata ?? defaultSummaryMetadata,
  });
}
