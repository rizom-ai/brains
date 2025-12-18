import { describe, it, expect, beforeEach } from "bun:test";
import type { BlogPlugin } from "../src/index";
import { blogPlugin } from "../src/index";
import { BlogPostAdapter } from "../src/adapters/blog-post-adapter";
import type { BlogPost } from "../src/schemas/blog-post";
import { createMockBlogPost } from "./fixtures/blog-entities";
import { computeContentHash } from "@brains/utils";

describe("BlogPlugin", () => {
  let plugin: BlogPlugin;

  beforeEach(() => {
    plugin = blogPlugin({
      defaultPrompt: "Write a blog post about my recent work",
    }) as BlogPlugin;
  });

  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      expect(plugin.id).toBe("blog");
      expect(plugin.description).toContain("AI-powered blog post generation");
      expect(plugin.version).toBe("0.1.0");
    });

    it("should use default configuration when not provided", () => {
      const defaultPlugin = blogPlugin({
        defaultPrompt: "Write a blog post about my recent work and insights",
      }) as BlogPlugin;
      expect(defaultPlugin.id).toBe("blog");
      expect(defaultPlugin.version).toBe("0.1.0");
    });

    it("should accept custom configuration", () => {
      const customPlugin = blogPlugin({
        defaultPrompt: "Custom prompt here",
      }) as BlogPlugin;

      expect(customPlugin.id).toBe("blog");
      expect(customPlugin.version).toBe("0.1.0");
    });
  });

  describe("BlogPostAdapter", () => {
    let adapter: BlogPostAdapter;

    beforeEach(() => {
      adapter = new BlogPostAdapter();
    });

    it("should have correct entity type and schema", () => {
      expect(adapter.entityType).toBe("post");
      expect(adapter.schema).toBeDefined();
    });

    it("should convert entity with frontmatter to markdown", () => {
      const content = `---
title: My First Blog Post
status: draft
excerpt: This is a short excerpt
author: Test Author
---

# My First Blog Post

This is the content of my blog post.`;

      const entity: BlogPost = {
        id: "test-post-1",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "My First Blog Post",
          slug: "my-first-blog-post",
          status: "draft",
        },
      };

      const markdown = adapter.toMarkdown(entity);

      // Should contain frontmatter with all fields
      expect(markdown).toContain("---");
      expect(markdown).toContain("title: My First Blog Post");
      expect(markdown).toContain("status: draft");
      expect(markdown).toContain("excerpt: This is a short excerpt");
      expect(markdown).toContain("author: Test Author");

      // Should contain content body
      expect(markdown).toContain("# My First Blog Post");
      expect(markdown).toContain("This is the content of my blog post.");
    });

    it("should convert markdown with frontmatter to entity", () => {
      const markdown = `---
title: Another Blog Post
status: published
publishedAt: "2025-01-30T12:00:00.000Z"
excerpt: Another excerpt
author: Jane Doe
---

# Another Blog Post

This is another blog post.`;

      const partialEntity = adapter.fromMarkdown(markdown);

      expect(partialEntity.entityType).toBe("post");
      expect(partialEntity.content).toBe(markdown);
      expect(partialEntity.metadata).toBeDefined();
      // Metadata only has key searchable fields
      expect(partialEntity.metadata?.["title"]).toBe("Another Blog Post");
      expect(partialEntity.metadata?.["status"]).toBe("published");
      expect(partialEntity.metadata?.["publishedAt"]).toBe(
        "2025-01-30T12:00:00.000Z",
      );
      // Author and excerpt are in frontmatter, not metadata
      expect("author" in (partialEntity.metadata ?? {})).toBe(false);
      expect("excerpt" in (partialEntity.metadata ?? {})).toBe(false);
    });

    it("should extract metadata for search/filtering", () => {
      const content = `---
title: Search Test Post
status: published
publishedAt: "2025-01-30T15:00:00.000Z"
excerpt: Excerpt for search
author: Search Author
seriesName: Test Series
seriesIndex: 1
---

Content here`;

      const entity: BlogPost = {
        id: "test-post-3",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Search Test Post",
          slug: "search-test-post",
          status: "published",
          publishedAt: "2025-01-30T15:00:00.000Z",
          seriesName: "Test Series",
          seriesIndex: 1,
        },
      };

      const metadata = adapter.extractMetadata(entity);

      // Only key searchable fields are in metadata
      expect(metadata["title"]).toBe("Search Test Post");
      expect(metadata["status"]).toBe("published");
      expect(metadata["publishedAt"]).toBe("2025-01-30T15:00:00.000Z");
      expect(metadata["seriesName"]).toBe("Test Series");
      expect(metadata["seriesIndex"]).toBe(1);
      // Author, excerpt, coverImage are NOT in metadata
      expect("author" in metadata).toBe(false);
      expect("excerpt" in metadata).toBe(false);
      expect("coverImage" in metadata).toBe(false);
    });

    it("should handle optional metadata fields", () => {
      const content = `---
title: Minimal Post
status: draft
excerpt: Minimal excerpt
author: Minimal Author
---

Minimal content`;

      const entity: BlogPost = {
        id: "test-post-4",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Minimal Post",
          slug: "minimal-post",
          status: "draft",
        },
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata["title"]).toBe("Minimal Post");
      expect(metadata["status"]).toBe("draft");
      expect(metadata["publishedAt"]).toBeUndefined();
      expect(metadata["seriesName"]).toBeUndefined();
      expect(metadata["seriesIndex"]).toBeUndefined();
    });

    it("should handle series metadata", () => {
      const content = `---
title: Series Post Part 1
status: published
publishedAt: "2025-01-30T16:00:00.000Z"
excerpt: First part of series
author: Series Author
seriesName: My Blog Series
seriesIndex: 1
---

Series post content`;

      const entity: BlogPost = {
        id: "test-post-5",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Series Post Part 1",
          slug: "series-post-part-1",
          status: "published",
          publishedAt: "2025-01-30T16:00:00.000Z",
          seriesName: "My Blog Series",
          seriesIndex: 1,
        },
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("seriesName: My Blog Series");
      expect(markdown).toContain("seriesIndex: 1");

      const metadata = adapter.extractMetadata(entity);
      expect(metadata["seriesName"]).toBe("My Blog Series");
      expect(metadata["seriesIndex"]).toBe(1);
    });

    it("should handle cover image in frontmatter", () => {
      const content = `---
title: Post With Image
status: draft
excerpt: Has a cover image
author: Image Author
coverImage: https://example.com/image.png
---

Post with cover image`;

      const entity: BlogPost = {
        id: "test-post-6",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Post With Image",
          slug: "post-with-image",
          status: "draft",
        },
      };

      const markdown = adapter.toMarkdown(entity);
      // YAML serialization may quote the URL
      expect(markdown).toMatch(
        /coverImage:.*https:\/\/example\.com\/image\.png/,
      );

      const metadata = adapter.extractMetadata(entity);
      // coverImage is in frontmatter, not metadata
      expect("coverImage" in metadata).toBe(false);
    });

    it("should merge auto-generated slug from metadata into frontmatter when missing", () => {
      // Content without slug in frontmatter
      const content = `---
title: Post Without Slug
status: draft
excerpt: Test excerpt
author: Test Author
---

# Post Without Slug

Content here`;

      const entity: BlogPost = {
        id: "test-post-7",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Post Without Slug",
          slug: "post-without-slug", // Auto-generated slug in metadata
          status: "draft",
        },
      };

      const markdown = adapter.toMarkdown(entity);

      // Should contain the auto-generated slug from metadata
      expect(markdown).toContain("slug: post-without-slug");
      expect(markdown).toContain("title: Post Without Slug");
      expect(markdown).toContain("# Post Without Slug");
    });

    it("should preserve auto-generated slug through fromMarkdown -> toMarkdown roundtrip", () => {
      // User creates a post without slug
      const originalMarkdown = `---
title: My Great Post
status: draft
excerpt: Test excerpt
author: Test Author
---

# My Great Post

Post content here`;

      // Parse with fromMarkdown (auto-generates slug)
      const partialEntity = adapter.fromMarkdown(originalMarkdown);

      // Verify slug was auto-generated
      expect(partialEntity.metadata?.["slug"]).toBe("my-great-post");

      // Create full entity
      const fullEntity = createMockBlogPost({
        id: "test-post-8",
        content: originalMarkdown,
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "My Great Post",
          slug: "my-great-post", // Auto-generated slug
          status: "draft",
        },
      });

      // Convert back to markdown
      const outputMarkdown = adapter.toMarkdown(fullEntity);

      // Should now contain the auto-generated slug
      expect(outputMarkdown).toContain("slug: my-great-post");
      expect(outputMarkdown).toContain("title: My Great Post");
      expect(outputMarkdown).toContain("# My Great Post");

      // Parse again to verify roundtrip
      const reparsed = adapter.fromMarkdown(outputMarkdown);
      expect(reparsed.metadata?.["slug"]).toBe("my-great-post");
    });
  });
});
