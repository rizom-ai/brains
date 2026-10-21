import { describe, expect, it } from "bun:test";
import { DecisionAdapter } from "../src/adapters/conversation-memory-adapters";
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
  it("shows a decision's origin as facts and its people by name", () => {
    expect(widgets(decisionMetadataSchema.shape)).toEqual({
      conversationId: "provenance",
      channelId: "provenance",
      channelName: "provenance",
      interfaceType: "provenance",
      timeRange: "provenance",
      status: undefined,
      decidedBy: "people",
      mentionedBy: "people",
    });
  });

  it("shows a summary's origin as facts, its participants by name, and hides its hash", () => {
    expect(widgets(summaryMetadataSchema.shape)).toEqual({
      channelId: "provenance",
      channelName: "provenance",
      interfaceType: "provenance",
      timeRange: "provenance",
      messageCount: "provenance",
      participants: "people",
      sourceHash: "hidden",
    });
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
