import { describe, expect, it } from "bun:test";
import { DecisionAdapter } from "../src/adapters/conversation-memory-adapters";
import { SummaryAdapter } from "../src/adapters/summary-adapter";
import { decisionMetadataSchema } from "../src/schemas/conversation-memory";
import { summaryMetadataSchema } from "../src/schemas/summary";

function widgets(
  shape: Record<string, { meta(): unknown }>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(shape).map(([name, field]) => {
      const meta = field.meta();
      return [
        name,
        typeof meta === "object" && meta !== null
          ? Reflect.get(meta, "studioWidget")
          : undefined,
      ];
    }),
  );
}

describe("conversation memory in Studio", () => {
  it("shows a decision's origin as facts, without its routing ids, and its people by name", () => {
    expect(widgets(decisionMetadataSchema.shape)).toEqual({
      conversationId: "hidden",
      channelId: "hidden",
      channelName: "provenance",
      interfaceType: "provenance",
      timeRange: "provenance",
      status: undefined,
      decidedBy: "people",
      mentionedBy: "people",
    });
  });

  it("shows a summary's origin as facts, its participants by name, and hides its hash and channel id", () => {
    expect(widgets(summaryMetadataSchema.shape)).toEqual({
      channelId: "hidden",
      channelName: "provenance",
      interfaceType: "provenance",
      timeRange: "provenance",
      messageCount: "provenance",
      participants: "people",
      sourceHash: "hidden",
    });
  });

  it("names a summary by its channel and day", () => {
    expect(
      new SummaryAdapter().displayTitle({
        id: "team-poc-sync",
        entityType: "summary",
        content: "# Conversation Summary\n",
        contentHash: "hash",
        visibility: "shared",
        created: "2026-05-06T10:18:00.000Z",
        updated: "2026-05-06T10:18:00.000Z",
        metadata: {
          channelId: "team-poc",
          channelName: "team-poc",
          interfaceType: "discord",
          timeRange: {
            start: "2026-05-06T10:00:00.000Z",
            end: "2026-05-06T10:18:00.000Z",
          },
          messageCount: 8,
          sourceHash: "hash",
        },
      }),
    ).toBe("team-poc · 2026-05-06");
  });

  it("names a decision by its heading", () => {
    expect(
      new DecisionAdapter().displayTitle({
        id: "conv-1:decision:1:abc",
        entityType: "decision",
        content:
          "---\nstatus: active\n---\n\n# Launch the hub in November\n\nWe will.\n",
        contentHash: "hash",
        visibility: "shared",
        created: "2026-10-01T00:00:00.000Z",
        updated: "2026-10-01T00:00:00.000Z",
        metadata: {
          conversationId: "conv-1",
          channelId: "events",
          interfaceType: "discord",
          timeRange: {
            start: "2026-10-01T10:00:00.000Z",
            end: "2026-10-01T10:05:00.000Z",
          },
          status: "active",
        },
      }),
    ).toBe("Launch the hub in November");
  });
});
