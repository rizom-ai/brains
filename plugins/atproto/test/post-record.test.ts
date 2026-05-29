import { describe, expect, it } from "bun:test";
import type { BlogPost } from "@brains/blog";
import { blogPostAdapter, blogPostSchema } from "@brains/blog";
import { buildPostRecord } from "../src";

function createBlogPost(): BlogPost {
  const content = blogPostAdapter.createPostContent(
    {
      title: "Distributed Brains",
      slug: "distributed-brains",
      status: "published",
      publishedAt: "2026-05-28T12:00:00.000Z",
      excerpt: "How brains publish to the open social web.",
      author: "Yeehaa",
      canonicalUrl: "https://brain.example.com/blog/distributed-brains",
      seriesName: "Open Protocols",
      seriesIndex: 2,
    },
    "# Distributed Brains\n\nBrains should publish projections, not duplicate content models.",
  );

  return blogPostSchema.parse({
    id: "post-123",
    entityType: "post",
    content,
    created: "2026-05-28T10:00:00.000Z",
    updated: "2026-05-28T12:30:00.000Z",
    visibility: "public",
    contentHash: "hash",
    metadata: {
      title: "Distributed Brains",
      slug: "distributed-brains",
      status: "published",
      publishedAt: "2026-05-28T12:00:00.000Z",
      seriesName: "Open Protocols",
      seriesIndex: 2,
    },
  });
}

describe("post entity to AT Protocol record mapping", () => {
  it("maps an existing blog post entity to ai.rizom.brain.post", () => {
    const record = buildPostRecord(createBlogPost(), {
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:plc:anchor",
      topics: ["protocols", "publishing"],
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.post",
      title: "Distributed Brains",
      summary: "How brains publish to the open social web.",
      body: "# Distributed Brains\n\nBrains should publish projections, not duplicate content models.",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:plc:anchor",
      canonicalUrl: "https://brain.example.com/blog/distributed-brains",
      topics: ["protocols", "publishing"],
      series: "Open Protocols",
      seriesIndex: 2,
      sourceEntityType: "post",
      sourceEntityId: "post-123",
      createdAt: "2026-05-28T10:00:00.000Z",
      publishedAt: "2026-05-28T12:00:00.000Z",
    });
  });

  it("refuses non-post entities", () => {
    expect(() =>
      buildPostRecord(
        {
          ...createBlogPost(),
          entityType: "note",
        },
        {},
      ),
    ).toThrow("Expected entityType post");
  });
});
