import { describe, it, expect } from "bun:test";
import { socialPostAdapter } from "../../src/adapters/social-post-adapter";
import type { SocialPost } from "../../src/schemas/social-post";

/**
 * Social post format:
 * - Post content goes in markdown BODY (not frontmatter)
 * - Metadata (title, platform, status, etc.) goes in frontmatter
 * - Slug is auto-generated from platform + title (e.g., "linkedin-product-launch")
 *
 * Example:
 * ---
 * title: Product Launch Announcement
 * platform: linkedin
 * status: draft
 * ---
 * This is the actual post content that will be published.
 */
describe("SocialPostAdapter", () => {
  describe("adapter properties", () => {
    it("should have entityType 'social-post'", () => {
      expect(socialPostAdapter.entityType).toBe("social-post");
    });

    it("should support cover images", () => {
      expect(socialPostAdapter.supportsCoverImage).toBe(true);
    });
  });

  describe("fromMarkdown", () => {
    it("should parse markdown with post content in body", () => {
      const markdown = `---
title: TypeScript Best Practices
platform: linkedin
status: draft
---
Check out my new article about TypeScript best practices!`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("social-post");
      expect(result.metadata?.title).toBe("TypeScript Best Practices");
      expect(result.metadata?.platform).toBe("linkedin");
      expect(result.metadata?.status).toBe("draft");
    });

    it("should auto-generate slug from platform + title + date", () => {
      const markdown = `---
title: Product Launch Update
platform: linkedin
status: draft
---
This is a test post for LinkedIn`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      // Slug format: {platform}-{title}-{YYYYMMDD}
      expect(result.metadata?.slug).toMatch(
        /^linkedin-product-launch-update-\d{8}$/,
      );
    });

    it("should parse queued post with queueOrder", () => {
      const markdown = `---
title: Weekly Newsletter
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
title: Q4 Results Summary
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
title: Blog Post Promotion
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
title: Failed Announcement
platform: linkedin
status: failed
retryCount: 3
lastError: "API rate limit exceeded"
---
This post failed`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.status).toBe("failed");
    });

    it("should parse post with coverImageId", () => {
      const markdown = `---
title: Visual Post
platform: linkedin
status: draft
coverImageId: image-xyz789
---
Post with an image`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.content).toContain("coverImageId: image-xyz789");
    });
  });

  describe("toMarkdown", () => {
    it("should convert entity to markdown with content in body", () => {
      const entity: SocialPost = {
        id: "social-post-123",
        entityType: "social-post",
        content: `---
title: Hello World Post
platform: linkedin
status: draft
---
Hello world`,
        metadata: {
          title: "Hello World Post",
          slug: "linkedin-hello-world-post",
          platform: "linkedin",
          status: "draft",
        },
        contentHash: "abc123",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };

      const markdown = socialPostAdapter.toMarkdown(entity);

      expect(markdown).toContain("title: Hello World Post");
      expect(markdown).toContain("platform: linkedin");
      expect(markdown).toContain("Hello world");
    });

    it("should roundtrip markdown -> entity -> markdown", () => {
      const originalMarkdown = `---
title: Roundtrip Test
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
      expect(resultMarkdown).toContain("title: Roundtrip Test");
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
          title: "Test Post Title",
          slug: "linkedin-test-post-title",
          platform: "linkedin",
          status: "queued",
          queueOrder: 3,
        },
        contentHash: "abc",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };

      const metadata = socialPostAdapter.extractMetadata(entity);

      expect(metadata.title).toBe("Test Post Title");
      expect(metadata.slug).toBe("linkedin-test-post-title");
      expect(metadata.platform).toBe("linkedin");
      expect(metadata.queueOrder).toBe(3);
    });
  });

  describe("createPostContent", () => {
    it("should create markdown with frontmatter and body", () => {
      const frontmatter = {
        title: "New Social Post",
        platform: "linkedin" as const,
        status: "draft" as const,
        retryCount: 0,
      };
      const body = "New social post content";

      const markdown = socialPostAdapter.createPostContent(frontmatter, body);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: New Social Post");
      expect(markdown).toContain("platform: linkedin");
      expect(markdown).toContain("New social post content");
    });

    it("should include optional fields in frontmatter", () => {
      const frontmatter = {
        title: "Queued Post Title",
        platform: "linkedin" as const,
        status: "queued" as const,
        queueOrder: 5,
        sourceEntityId: "post-123",
        sourceEntityType: "post" as const,
        retryCount: 0,
      };
      const body = "Queued post content";

      const markdown = socialPostAdapter.createPostContent(frontmatter, body);

      expect(markdown).toContain("title: Queued Post Title");
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
title: My Published Post
platform: linkedin
status: published
publishedAt: "2024-01-15T10:30:00Z"
---
My post content`,
        metadata: {
          title: "My Published Post",
          slug: "linkedin-my-published-post",
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
    it("should generate slug from platform + title + date", () => {
      const markdown = `---
title: Amazing New Feature
platform: linkedin
status: draft
---
This is the full post content that describes the feature in detail`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      // Slug format: {platform}-{title}-{YYYYMMDD}
      expect(result.metadata?.slug).toMatch(
        /^linkedin-amazing-new-feature-\d{8}$/,
      );
    });

    it("should handle special characters in title for slug", () => {
      const markdown = `---
title: What's New in TypeScript 5.0?
platform: linkedin
status: draft
---
Check out the latest features`;

      const result = socialPostAdapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).not.toContain("'");
      expect(result.metadata?.slug).not.toContain("?");
      // Slug format: {platform}-{title}-{YYYYMMDD}
      expect(result.metadata?.slug).toMatch(
        /^linkedin-whats-new-in-typescript-50-\d{8}$/,
      );
    });

    it("should handle long titles", () => {
      const markdown = `---
title: This Is A Very Long Title That Should Be Handled Properly
platform: linkedin
status: draft
---
Post content`;

      const result = socialPostAdapter.fromMarkdown(markdown);
      const slug = result.metadata?.slug;

      expect(slug).toBeDefined();
      expect(slug).toMatch(/^linkedin-.*-\d{8}$/);
    });
  });
});
