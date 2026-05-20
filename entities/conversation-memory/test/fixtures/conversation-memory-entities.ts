import type { ContentVisibility } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../../src/schemas/conversation-memory";

export function createMockDecisionEntity(
  id: string,
  visibility: ContentVisibility,
): DecisionEntity {
  return createTestEntity<DecisionEntity>("decision", {
    id,
    visibility,
    metadata: {
      conversationId: "conv-1",
      channelId: "cli-terminal",
      channelName: "CLI Terminal",
      interfaceType: "cli",
      spaceId: "cli:cli-terminal",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: "conv-1",
      sourceMessageCount: 2,
      projectionVersion: 1,
      status: "active",
    },
  });
}

export function createMockActionItemEntity(
  id: string,
  visibility: ContentVisibility,
): ActionItemEntity {
  return createTestEntity<ActionItemEntity>("action-item", {
    id,
    visibility,
    metadata: {
      conversationId: "conv-1",
      channelId: "cli-terminal",
      channelName: "CLI Terminal",
      interfaceType: "cli",
      spaceId: "cli:cli-terminal",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: "conv-1",
      sourceMessageCount: 2,
      projectionVersion: 1,
      status: "open",
    },
  });
}
