import { createTestEntity } from "@brains/entity-service/test";
import { describe, expect, it } from "bun:test";
import { postFeedItem } from "../src/feed";
import type { BlogPost, BlogPostMetadata } from "../src/schemas/blog-post";

const METADATA: BlogPostMetadata = {
  title: "Tom & Jerry",
  slug: "tom-and-jerry",
  status: "published",
  publishedAt: "2025-01-15T10:00:00.000Z",
  excerpt: "A <chase>",
  author: "Alex",
};

// A post as a declared type reads it: its metadata and its body.
function post(metadata: Partial<BlogPostMetadata> = {}): BlogPost {
  return createTestEntity<BlogPost>("post", {
    id: "tom-and-jerry",
    content: "## Chase\n\nBody",
    created: "2025-01-01T00:00:00.000Z",
    metadata: { ...METADATA, ...metadata },
  });
}

describe("a post in the blog's feed", () => {
  it("is its title, excerpt, body and author, dated when it was published", () => {
    expect(postFeedItem(post(), { environment: "production" })).toEqual({
      title: "Tom & Jerry",
      slug: "tom-and-jerry",
      description: "A <chase>",
      content: "## Chase\n\nBody",
      author: "Alex",
      publishedAt: "2025-01-15T10:00:00.000Z",
    });
  });

  it("names its series as the category", () => {
    expect(
      postFeedItem(post({ seriesName: "Cartoons" }), {
        environment: "production",
      }),
    ).toMatchObject({ category: "Cartoons" });
  });

  it("is in a production feed only once published and dated", () => {
    for (const metadata of [
      { status: "draft" as const },
      { status: "queued" as const },
      { publishedAt: undefined },
    ]) {
      expect(
        postFeedItem(post(metadata), { environment: "production" }),
      ).toBeNull();
    }
  });

  it("is in a preview feed whatever its state, dated when it was written", () => {
    expect(
      postFeedItem(post({ status: "draft", publishedAt: undefined }), {
        environment: "preview",
      }),
    ).toMatchObject({ publishedAt: "2025-01-01T00:00:00.000Z" });
  });
});
