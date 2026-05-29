import { describe, expect, it } from "bun:test";
import type { BrainPostRecord } from "../src";
import { buildBlueskyPostRecord } from "../src";

function createPostRecord(
  input: Partial<BrainPostRecord> = {},
): BrainPostRecord {
  return {
    $type: "ai.rizom.brain.post",
    title: "Distributed Brains",
    summary: "How brains publish to the open social web.",
    body: "Brains should publish projections, not duplicate content models.",
    format: "text/markdown",
    canonicalUrl: "https://brain.example.com/blog/distributed-brains",
    sourceEntityType: "post",
    sourceEntityId: "post-123",
    createdAt: "2026-05-28T10:00:00.000Z",
    publishedAt: "2026-05-28T12:00:00.000Z",
    ...input,
  };
}

describe("Bluesky post record mapping", () => {
  it("maps a brain post projection to app.bsky.feed.post", () => {
    const record = buildBlueskyPostRecord(createPostRecord());

    expect(record).toEqual({
      $type: "app.bsky.feed.post",
      text: "Distributed Brains\n\nHow brains publish to the open social web.",
      createdAt: "2026-05-28T12:00:00.000Z",
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: "https://brain.example.com/blog/distributed-brains",
          title: "Distributed Brains",
          description: "How brains publish to the open social web.",
        },
      },
    });
  });

  it("keeps Bluesky text within the 300 character limit", () => {
    const record = buildBlueskyPostRecord(
      createPostRecord({
        title: "A".repeat(280),
        summary: "B".repeat(100),
      }),
    );

    expect(record.text.length).toBeLessThanOrEqual(300);
    expect(record.text.endsWith("…")).toBe(true);
  });
});
