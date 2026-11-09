import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeAll } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  blogPostFrontmatterSchema,
  blogPostMetadataSchema,
  type BlogPost,
  type BlogPostMetadata,
} from "../src/schemas/blog-post";
import { blogPlugin } from "./blog-plugin";

const METADATA: BlogPostMetadata = {
  title: "My First Blog Post",
  slug: "my-first-blog-post",
  status: "draft",
  excerpt: "This is a short excerpt",
  author: "Test Author",
};

function createMockPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return createTestEntity<BlogPost>("post", {
    content: "# My First Blog Post\n\nThis is the content of my blog post.",
    metadata: METADATA,
    ...overrides,
  });
}

describe("blogPostFrontmatterSchema", () => {
  it("rejects an empty-string publishedAt, so list templates can use ?? to fall back to created", () => {
    const base = {
      title: "Post",
      status: "draft",
      excerpt: "Excerpt",
      author: "Author",
    };
    expect(
      blogPostFrontmatterSchema.safeParse({ ...base, publishedAt: "" }).success,
    ).toBe(false);
    expect(blogPostFrontmatterSchema.safeParse(base).success).toBe(true);
  });
});

/** The post's adapter, as the declared post registers it. */
describe("the post adapter", () => {
  let adapter: EntityAdapter<BaseEntity>;

  beforeAll(async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(blogPlugin());
    adapter = harness.getEntityRegistry().getAdapter("post");
  });

  it("reads the frontmatter as metadata and the post as the body", () => {
    const result = adapter.fromMarkdown(`---
title: Another Blog Post
status: published
publishedAt: "2025-01-30T10:00:00.000Z"
excerpt: Another excerpt
author: John Doe
seriesName: Test Series
seriesIndex: 1
coverImageId: hero-image
---

# Another Blog Post

Content here`);
    expect(result.metadata).toEqual({
      title: "Another Blog Post",
      slug: "another-blog-post",
      status: "published",
      publishedAt: "2025-01-30T10:00:00.000Z",
      excerpt: "Another excerpt",
      author: "John Doe",
      seriesName: "Test Series",
      seriesIndex: 1,
      coverImageId: "hero-image",
    });
    expect(result.content).toBe("# Another Blog Post\n\nContent here");
  });

  it("keeps a stated slug and the error a failed generation recorded", () => {
    const result = adapter.fromMarkdown(
      "---\ntitle: Failed\nslug: failed\nstatus: failed\nexcerpt: ''\nauthor: AI\nerror: The model refused\n---\n",
    );
    expect(result.metadata).toMatchObject({
      slug: "failed",
      authoredSlug: true,
      error: "The model refused",
    });
  });

  it("writes a resolved slug after the other fields, as the adapter merged it", () => {
    expect(adapter.toMarkdown(createMockPost())).toBe(
      "---\ntitle: My First Blog Post\nstatus: draft\nexcerpt: This is a short excerpt\nauthor: Test Author\nslug: my-first-blog-post\n---\n# My First Blog Post\n\nThis is the content of my blog post.\n",
    );
  });

  it("writes a stated slug and the series where the file states them", () => {
    expect(
      adapter.toMarkdown(
        createMockPost({
          metadata: {
            ...METADATA,
            authoredSlug: true,
            status: "published",
            publishedAt: "2025-01-30T10:00:00.000Z",
            seriesName: "My Blog Series",
            seriesIndex: 1,
            coverImageId: "hero-image",
          },
        }),
      ),
    ).toBe(
      "---\ntitle: My First Blog Post\nslug: my-first-blog-post\nstatus: published\npublishedAt: '2025-01-30T10:00:00.000Z'\nexcerpt: This is a short excerpt\nauthor: Test Author\ncoverImageId: hero-image\nseriesName: My Blog Series\nseriesIndex: 1\n---\n# My First Blog Post\n\nThis is the content of my blog post.\n",
    );
  });

  it("writes a stated document back as it was", () => {
    const original =
      "---\ntitle: My Great Post\nslug: my-great-post\nstatus: draft\nexcerpt: E\nauthor: A\n---\n# My Great Post\n\nBody\n";
    const parsed = adapter.fromMarkdown(original);
    expect(
      adapter.toMarkdown(
        createMockPost({
          content: parsed.content ?? "",
          metadata: blogPostMetadataSchema.parse(parsed.metadata),
        }),
      ),
    ).toBe(original);
  });
});
