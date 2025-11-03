import { describe, it, expect, beforeEach } from "bun:test";
import type { BlogPlugin } from "../src/index";
import { blogPlugin } from "../src/index";
import { BlogPostAdapter } from "../src/adapters/blog-post-adapter";
import type { BlogPost } from "../src/schemas/blog-post";

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

    it("should convert entity to markdown with frontmatter", () => {
      const entity: BlogPost = {
        id: "test-post-1",
        entityType: "post",
        content: "# My First Blog Post\n\nThis is the content of my blog post.",
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "My First Blog Post",
          slug: "my-first-blog-post",
          status: "draft",
          excerpt: "This is a short excerpt",
          author: "Test Author",
        },
      };

      const markdown = adapter.toMarkdown(entity);

      // Should contain frontmatter
      expect(markdown).toContain("---");
      expect(markdown).toContain("id: test-post-1");
      expect(markdown).toContain("entityType: post");
      expect(markdown).toContain("title: My First Blog Post");
      expect(markdown).toContain("slug: my-first-blog-post");
      expect(markdown).toContain("status: draft");
      expect(markdown).toContain("excerpt: This is a short excerpt");
      expect(markdown).toContain("author: Test Author");

      // Should contain content
      expect(markdown).toContain("# My First Blog Post");
      expect(markdown).toContain("This is the content of my blog post.");
    });

    it("should convert markdown with frontmatter to entity", () => {
      const markdown = `---
id: test-post-2
entityType: post
created: "2025-01-30T12:00:00.000Z"
updated: "2025-01-30T12:00:00.000Z"
metadata:
  title: "Another Blog Post"
  slug: "another-blog-post"
  status: "published"
  publishedAt: "2025-01-30T12:00:00.000Z"
  excerpt: "Another excerpt"
  author: "Jane Doe"
---

# Another Blog Post

This is another blog post.`;

      const partialEntity = adapter.fromMarkdown(markdown);

      expect(partialEntity.id).toBe("test-post-2");
      expect(partialEntity.entityType).toBe("post");
      expect(partialEntity.created).toBe("2025-01-30T12:00:00.000Z");
      expect(partialEntity.updated).toBe("2025-01-30T12:00:00.000Z");
      expect(partialEntity.content).toBe(markdown);
      expect(partialEntity.metadata).toBeDefined();
      expect(partialEntity.metadata?.["title"]).toBe("Another Blog Post");
      expect(partialEntity.metadata?.["slug"]).toBe("another-blog-post");
      expect(partialEntity.metadata?.["status"]).toBe("published");
      expect(partialEntity.metadata?.["author"]).toBe("Jane Doe");
    });

    it("should extract metadata for search/filtering", () => {
      const entity: BlogPost = {
        id: "test-post-3",
        entityType: "post",
        content: "Content here",
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Search Test Post",
          slug: "search-test-post",
          status: "published",
          publishedAt: "2025-01-30T15:00:00.000Z",
          excerpt: "Excerpt for search",
          author: "Search Author",
          seriesName: "Test Series",
          seriesIndex: 1,
        },
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata["title"]).toBe("Search Test Post");
      expect(metadata["slug"]).toBe("search-test-post");
      expect(metadata["status"]).toBe("published");
      expect(metadata["publishedAt"]).toBe("2025-01-30T15:00:00.000Z");
      expect(metadata["author"]).toBe("Search Author");
      expect(metadata["seriesName"]).toBe("Test Series");
      expect(metadata["seriesIndex"]).toBe(1);
    });

    it("should handle optional metadata fields", () => {
      const entity: BlogPost = {
        id: "test-post-4",
        entityType: "post",
        content: "Minimal content",
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Minimal Post",
          slug: "minimal-post",
          status: "draft",
          excerpt: "Minimal excerpt",
          author: "Minimal Author",
        },
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata["title"]).toBe("Minimal Post");
      expect(metadata["slug"]).toBe("minimal-post");
      expect(metadata["status"]).toBe("draft");
      expect(metadata["author"]).toBe("Minimal Author");
      expect(metadata["publishedAt"]).toBeUndefined();
      expect(metadata["coverImage"]).toBeUndefined();
      expect(metadata["seriesName"]).toBeUndefined();
      expect(metadata["seriesIndex"]).toBeUndefined();
    });

    it("should handle series metadata", () => {
      const entity: BlogPost = {
        id: "test-post-5",
        entityType: "post",
        content: "Series post content",
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Series Post Part 1",
          slug: "series-post-part-1",
          status: "published",
          publishedAt: "2025-01-30T16:00:00.000Z",
          excerpt: "First part of series",
          author: "Series Author",
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

    it("should handle cover image metadata", () => {
      const entity: BlogPost = {
        id: "test-post-6",
        entityType: "post",
        content: "Post with cover image",
        created: "2025-01-30T10:00:00.000Z",
        updated: "2025-01-30T10:00:00.000Z",
        metadata: {
          title: "Post With Image",
          slug: "post-with-image",
          status: "draft",
          excerpt: "Has a cover image",
          author: "Image Author",
          coverImage: "https://example.com/image.png",
        },
      };

      const markdown = adapter.toMarkdown(entity);
      // YAML serialization may quote the URL
      expect(markdown).toMatch(
        /coverImage:.*https:\/\/example\.com\/image\.png/,
      );

      const metadata = adapter.extractMetadata(entity);
      expect(metadata["coverImage"]).toBeUndefined(); // extractMetadata doesn't include coverImage
    });
  });
});
