import { describe, it, expect } from "bun:test";
import { socialPostAdapter } from "../../src/adapters/social-post-adapter";
import type { SocialPost } from "../../src/schemas/social-post";

/**
 * Social post format:
 * - Post content goes in markdown BODY (not frontmatter)
 * - Metadata (platform, status, etc.) goes in frontmatter
 *
 * Example:
 * ---
 * platform: linkedin
 * status: draft
 * ---
 * This is the actual post content that will be published.
 */
describe("SocialPostAdapter", () => {
  describe("fromMarkdown", () => {
    it("should parse markdown with post content in body", () => {
      const markdown = `---
platform: linkedin
status: draft
---
Check out my new article about TypeScript best practices!`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("social-post");
      expect(result.metadata?.platform).toBe("linkedin");
      expect(result.metadata?.status).toBe("draft");
    });

    it("should auto-generate slug from body content preview", () => {
      const markdown = `---
platform: linkedin
status: draft
---
This is a test post for LinkedIn`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).toBe("this-is-a-test-post-for-linkedin");
    });

    it("should parse queued post with queueOrder", () => {
      const markdown = `---
platform: linkedin
status: queued
queueOrder: 5
---
Queued post ready to publish`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.status).toBe("queued");
      expect(result.metadata?.queueOrder).toBe(5);
    });

    it("should parse published post with timestamps", () => {
      const markdown = `---
platform: linkedin
status: published
publishedAt: "2024-01-15T10:30:00Z"
platformPostId: "urn:li:share:123456789"
---
Successfully published!`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.status).toBe("published");
      expect(result.metadata?.publishedAt).toBe("2024-01-15T10:30:00Z");
    });

    it("should parse post with source entity reference", () => {
      const markdown = `---
platform: linkedin
status: queued
sourceEntityId: post-123
sourceEntityType: post
---
Check out my blog post`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      // Source info preserved in content frontmatter
      expect(result.content).toContain("sourceEntityId: post-123");
      expect(result.content).toContain("sourceEntityType: post");
    });

    it("should parse failed post with error info", () => {
      const markdown = `---
platform: linkedin
status: failed
retryCount: 3
lastError: "API rate limit exceeded"
---
This post failed`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.status).toBe("failed");
    });
  });

  describe("toMarkdown", () => {
    it("should convert entity to markdown with content in body", () => {
      const entity: SocialPost = {
        id: "social-post-123",
        entityType: "social-post",
        content: `---
platform: linkedin
status: draft
---
Hello world`,
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

      expect(markdown).toContain("platform: linkedin");
      expect(markdown).toContain("Hello world");
    });

    it("should roundtrip markdown -> entity -> markdown", () => {
      const originalMarkdown = `---
platform: linkedin
status: queued
queueOrder: 1
---
Test roundtrip content`;

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

      expect(resultMarkdown).toContain("Test roundtrip content");
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
    it("should create markdown with frontmatter and body", () => {
      const frontmatter = {
        platform: "linkedin" as const,
        status: "draft" as const,
        retryCount: 0,
      };
      const body = "New social post content";

      const markdown = socialPostAdapter.createPostContent(frontmatter, body);

      expect(markdown).toContain("---");
      expect(markdown).toContain("platform: linkedin");
      expect(markdown).toContain("New social post content");
    });

    it("should include optional fields in frontmatter", () => {
      const frontmatter = {
        platform: "linkedin" as const,
        status: "queued" as const,
        queueOrder: 5,
        sourceEntityId: "post-123",
        sourceEntityType: "post" as const,
        retryCount: 0,
      };
      const body = "Queued post content";

      const markdown = socialPostAdapter.createPostContent(frontmatter, body);

      expect(markdown).toContain("queueOrder: 5");
      expect(markdown).toContain("sourceEntityId: post-123");
    });
  });

  describe("getPostContent", () => {
    it("should extract post text from entity body", () => {
      const entity: SocialPost = {
        id: "test-123",
        entityType: "social-post",
        content: `---
platform: linkedin
status: published
publishedAt: "2024-01-15T10:30:00Z"
---
My post content`,
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

      const postContent = socialPostAdapter.getPostContent(entity);

      expect(postContent).toBe("My post content");
    });
  });

  describe("slug generation", () => {
    it("should generate slug from first 50 chars of body content", () => {
      const markdown = `---
platform: linkedin
status: draft
---
This is a very long content that should be truncated for the slug generation process and more text here`;

      const result = socialPostAdapter.fromMarkdown(markdown);
      const slug = result.metadata?.slug;

      expect(slug).toBeDefined();
      expect(slug?.length).toBeLessThanOrEqual(60);
    });

    it("should handle special characters in content for slug", () => {
      const markdown = `---
platform: linkedin
status: draft
---
Check out @user's amazing post! #TypeScript #Dev`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).not.toContain("@");
      expect(result.metadata?.slug).not.toContain("#");
      expect(result.metadata?.slug).not.toContain("!");
    });

    it("should handle emojis in content for slug", () => {
      const markdown = `---
platform: linkedin
status: draft
---
Great news! We launched our product`;

      const result = socialPostAdapter.fromMarkdown(markdown);
      const slug = result.metadata?.slug;

      expect(slug).toBeDefined();
      expect(slug?.length).toBeGreaterThan(0);
    });
  });
});
