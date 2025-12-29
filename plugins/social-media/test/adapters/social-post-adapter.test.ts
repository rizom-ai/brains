import { describe, it, expect } from "bun:test";
import { socialPostAdapter } from "../../src/adapters/social-post-adapter";
import type { SocialPost } from "../../src/schemas/social-post";

describe("SocialPostAdapter", () => {
  describe("fromMarkdown", () => {
    it("should parse markdown with frontmatter into partial entity", () => {
      const markdown = `---
content: Check out my new article about TypeScript best practices!
platform: linkedin
status: draft
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      expect(result.entityType).toBe("social-post");
      expect(result.metadata?.platform).toBe("linkedin");
      expect(result.metadata?.status).toBe("draft");
    });

    it("should auto-generate slug from content preview", () => {
      const markdown = `---
content: This is a test post for LinkedIn
platform: linkedin
status: draft
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      expect(result.metadata?.slug).toBe("this-is-a-test-post-for-linkedin");
    });

    it("should parse queued post with queueOrder", () => {
      const markdown = `---
content: Queued post ready to publish
platform: linkedin
status: queued
queueOrder: 5
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      expect(result.metadata?.status).toBe("queued");
      expect(result.metadata?.queueOrder).toBe(5);
    });

    it("should parse published post with timestamps", () => {
      const markdown = `---
content: Successfully published!
platform: linkedin
status: published
publishedAt: "2024-01-15T10:30:00Z"
platformPostId: "urn:li:share:123456789"
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      expect(result.metadata?.status).toBe("published");
      expect(result.metadata?.publishedAt).toBe("2024-01-15T10:30:00Z");
    });

    it("should parse post with source entity reference", () => {
      const markdown = `---
content: Check out my blog post
platform: linkedin
status: queued
sourceEntityId: post-123
sourceEntityType: post
sourceUrl: https://example.com/blog/my-article
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      // Source info is preserved in the content, not metadata
      expect(result.content).toContain("sourceEntityId: post-123");
      expect(result.content).toContain("sourceEntityType: post");
    });

    it("should parse failed post with error info", () => {
      const markdown = `---
content: This post failed
platform: linkedin
status: failed
retryCount: 3
lastError: "API rate limit exceeded"
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      expect(result.metadata?.status).toBe("failed");
    });
  });

  describe("toMarkdown", () => {
    it("should convert entity to markdown with frontmatter", () => {
      const entity: SocialPost = {
        id: "social-post-123",
        entityType: "social-post",
        content: `---
content: Hello world
platform: linkedin
status: draft
---
`,
        metadata: {
          slug: "hello-world",
          platform: "linkedin",
          status: "draft",
        },
        contentHash: "abc123",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const markdown = socialPostAdapter.toMarkdown(entity);
      expect(markdown).toContain("content: Hello world");
      expect(markdown).toContain("platform: linkedin");
    });

    it("should roundtrip markdown -> entity -> markdown", () => {
      const originalMarkdown = `---
content: Test roundtrip content
platform: linkedin
status: queued
queueOrder: 1
---
`;
      const partialEntity = socialPostAdapter.fromMarkdown(originalMarkdown);
      expect(partialEntity.content).toBeDefined();
      expect(partialEntity.metadata).toBeDefined();
      const entity: SocialPost = {
        id: "test-123",
        entityType: "social-post",
        content: partialEntity.content as string,
        metadata: partialEntity.metadata as SocialPost["metadata"],
        contentHash: "abc",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const resultMarkdown = socialPostAdapter.toMarkdown(entity);
      expect(resultMarkdown).toContain("content: Test roundtrip content");
      expect(resultMarkdown).toContain("platform: linkedin");
      expect(resultMarkdown).toContain("queueOrder: 1");
    });
  });

  describe("extractMetadata", () => {
    it("should extract metadata from entity", () => {
      const entity: SocialPost = {
        id: "social-post-123",
        entityType: "social-post",
        content: "test",
        metadata: {
          slug: "test-post",
          platform: "linkedin",
          status: "queued",
          queueOrder: 3,
        },
        contentHash: "abc",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const metadata = socialPostAdapter.extractMetadata(entity);
      expect(metadata.slug).toBe("test-post");
      expect(metadata.platform).toBe("linkedin");
      expect(metadata.queueOrder).toBe(3);
    });
  });

  describe("createPostContent", () => {
    it("should create markdown content with frontmatter", () => {
      const frontmatter = {
        content: "New social post content",
        platform: "linkedin" as const,
        status: "draft" as const,
        retryCount: 0,
      };
      const body = "";
      const markdown = socialPostAdapter.createPostContent(frontmatter, body);
      expect(markdown).toContain("---");
      expect(markdown).toContain("content: New social post content");
      expect(markdown).toContain("platform: linkedin");
    });

    it("should include optional fields in frontmatter", () => {
      const frontmatter = {
        content: "Queued post",
        platform: "linkedin" as const,
        status: "queued" as const,
        queueOrder: 5,
        sourceEntityId: "post-123",
        sourceEntityType: "post" as const,
        sourceUrl: "https://example.com/blog",
        retryCount: 0,
      };
      const markdown = socialPostAdapter.createPostContent(frontmatter, "");
      expect(markdown).toContain("queueOrder: 5");
      expect(markdown).toContain("sourceEntityId: post-123");
      // URL may be quoted in YAML
      expect(markdown).toContain("sourceUrl:");
      expect(markdown).toContain("https://example.com/blog");
    });
  });

  describe("parsePostFrontmatter", () => {
    it("should parse frontmatter from entity content", () => {
      const entity: SocialPost = {
        id: "test-123",
        entityType: "social-post",
        content: `---
content: My post content
platform: linkedin
status: published
publishedAt: "2024-01-15T10:30:00Z"
---
`,
        metadata: {
          slug: "my-post",
          platform: "linkedin",
          status: "published",
          publishedAt: "2024-01-15T10:30:00Z",
        },
        contentHash: "abc",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const frontmatter = socialPostAdapter.parsePostFrontmatter(entity);
      expect(frontmatter.content).toBe("My post content");
      expect(frontmatter.platform).toBe("linkedin");
      expect(frontmatter.status).toBe("published");
    });
  });

  describe("slug generation", () => {
    it("should generate slug from first 50 chars of content", () => {
      const markdown = `---
content: This is a very long content that should be truncated for the slug generation process and more text here
platform: linkedin
status: draft
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      // Slug should be truncated
      const slug = result.metadata?.slug;
      expect(slug).toBeDefined();
      expect(slug?.length).toBeLessThanOrEqual(60);
    });

    it("should handle special characters in content for slug", () => {
      const markdown = `---
content: "Check out @user's amazing post! #TypeScript #Dev"
platform: linkedin
status: draft
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      // Slug should be URL-safe (slugify removes special chars)
      expect(result.metadata?.slug).not.toContain("@");
      expect(result.metadata?.slug).not.toContain("#");
      expect(result.metadata?.slug).not.toContain("!");
    });

    it("should handle emojis in content for slug", () => {
      const markdown = `---
content: "Great news! 🎉 We launched our product"
platform: linkedin
status: draft
---
`;
      const result = socialPostAdapter.fromMarkdown(markdown);
      const slug = result.metadata?.slug;
      expect(slug).toBeDefined();
      // Should still produce a valid slug
      expect(slug?.length).toBeGreaterThan(0);
    });
  });
});
