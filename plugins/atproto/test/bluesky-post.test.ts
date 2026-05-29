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

function byteRange(
  text: string,
  substring: string,
): { byteStart: number; byteEnd: number } {
  const start = text.indexOf(substring);
  if (start === -1) throw new Error(`Missing substring: ${substring}`);
  const end = start + substring.length;
  const encoder = new TextEncoder();
  return {
    byteStart: encoder.encode(text.slice(0, start)).length,
    byteEnd: encoder.encode(text.slice(0, end)).length,
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

  it("adds topic hashtags with Bluesky tag facets", () => {
    const record = buildBlueskyPostRecord(
      createPostRecord({ topics: ["AT Protocol", "brains"] }),
    );

    expect(record.text).toEndWith("#ATProtocol #brains");
    expect(record.facets).toEqual([
      {
        index: byteRange(record.text, "#ATProtocol"),
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "ATProtocol" }],
      },
      {
        index: byteRange(record.text, "#brains"),
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "brains" }],
      },
    ]);
  });

  it("uses an image embed with alt text and aspect ratio when a cover image exists", () => {
    const record = buildBlueskyPostRecord(
      createPostRecord({
        topics: ["protocols"],
        coverImage: {
          blob: {
            ref: { $link: "blob-cid" },
            mimeType: "image/png",
            size: 5,
          },
          alt: "Distributed brains diagram",
          width: 1200,
          height: 630,
        },
      }),
    );

    expect(record.text).toContain("#protocols");
    expect(record.text).toContain(
      "https://brain.example.com/blog/distributed-brains",
    );
    expect(record.facets).toContainEqual({
      index: byteRange(record.text, "#protocols"),
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: "protocols" }],
    });
    expect(record.facets).toContainEqual({
      index: byteRange(
        record.text,
        "https://brain.example.com/blog/distributed-brains",
      ),
      features: [
        {
          $type: "app.bsky.richtext.facet#link",
          uri: "https://brain.example.com/blog/distributed-brains",
        },
      ],
    });
    expect(record.embed).toEqual({
      $type: "app.bsky.embed.images",
      images: [
        {
          image: { ref: { $link: "blob-cid" }, mimeType: "image/png", size: 5 },
          alt: "Distributed brains diagram",
          aspectRatio: { width: 1200, height: 630 },
        },
      ],
    });
  });

  it("keeps Bluesky text within the 300 character limit", () => {
    const record = buildBlueskyPostRecord(
      createPostRecord({
        title: "A".repeat(280),
        summary: "B".repeat(100),
        topics: ["protocols"],
      }),
    );

    expect(record.text.length).toBeLessThanOrEqual(300);
    expect(record.text).toEndWith("#protocols");
    expect(record.text).toContain("…");
  });
});
