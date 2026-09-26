import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { postCodec } from "../helpers/codec";
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
  let codec: EntityAdapter<BaseEntity>;
  let release: () => void;

  beforeAll(async () => {
    const installed = await postCodec();
    codec = installed.adapter;
    release = installed.reset;
  });

  afterAll(() => {
    release();
  });

  describe("deriveMetadata", () => {
    it("should parse markdown with post content in body", () => {
      const markdown = `---
title: TypeScript Best Practices
platform: linkedin
status: draft
---
Check out my new article about TypeScript best practices!`;

      const result = codec.fromMarkdown(markdown);

      // The codec returns what it decodes — metadata and body. The entity
      // type is the registry's to know, not the file's.
      expect(result.metadata?.["title"]).toBe("TypeScript Best Practices");
      expect(result.metadata?.["platform"]).toBe("linkedin");
      expect(result.metadata?.["status"]).toBe("draft");
    });

    it("should auto-generate slug from platform + title", () => {
      const markdown = `---
title: Product Launch Update
platform: linkedin
status: draft
---
This is a test post for LinkedIn`;

      const result = codec.fromMarkdown(markdown);

      expect(result.metadata?.["slug"]).toBe("linkedin-product-launch-update");
    });

    it("should parse queued post", () => {
      const markdown = `---
title: Weekly Newsletter
platform: linkedin
status: queued
---
Queued post ready to publish`;

      const result = codec.fromMarkdown(markdown);

      expect(result.metadata?.["status"]).toBe("queued");
    });

    it("should parse published post with timestamps", () => {
      const markdown = `---
title: Q4 Results Summary
platform: linkedin
status: published
publishedAt: "2024-01-15T10:30:00Z"
---
Successfully published!`;

      const result = codec.fromMarkdown(markdown);

      expect(result.metadata?.["status"]).toBe("published");
      expect(result.metadata?.["publishedAt"]).toBe("2024-01-15T10:30:00Z");
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

      const result = codec.fromMarkdown(markdown);

      // Source info stays in the file's frontmatter; the codec does not
      // index it, so it never reaches metadata.
      expect(result.metadata).not.toHaveProperty("sourceEntityId");
      expect(result.metadata?.["status"]).toBe("queued");
    });

    it("should parse failed post", () => {
      const markdown = `---
title: Failed Announcement
platform: linkedin
status: failed
---
This post failed`;

      const result = codec.fromMarkdown(markdown);

      expect(result.metadata?.["status"]).toBe("failed");
    });

    it("should parse post with coverImageId", () => {
      const markdown = `---
title: Visual Post
platform: linkedin
status: draft
coverImageId: image-xyz789
---
Post with an image`;

      const result = codec.fromMarkdown(markdown);

      // Same for the cover image: carried in the file, not indexed.
      expect(result.metadata).not.toHaveProperty("coverImageId");
      expect(result.metadata?.["title"]).toBe("Visual Post");
    });
  });

  describe("createPostContent", () => {
    it("should create markdown with frontmatter and body", () => {
      const frontmatter = {
        title: "New Social Post",
        platform: "linkedin" as const,
        status: "draft" as const,
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
        sourceEntityId: "post-123",
        sourceEntityType: "post" as const,
      };
      const body = "Queued post content";

      const markdown = socialPostAdapter.createPostContent(frontmatter, body);

      expect(markdown).toContain("title: Queued Post Title");
      expect(markdown).toContain("sourceEntityId: post-123");
    });
  });

  describe("getPostContent", () => {
    it("should extract post text from entity body", () => {
      const entity: SocialPost = {
        id: "test-123",
        entityType: "social-post",
        visibility: "public",
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
    it("should generate slug from platform + title", () => {
      const markdown = `---
title: Amazing New Feature
platform: linkedin
status: draft
---
This is the full post content that describes the feature in detail`;

      const result = codec.fromMarkdown(markdown);

      expect(result.metadata?.["slug"]).toBe("linkedin-amazing-new-feature");
    });

    it("should handle special characters in title for slug", () => {
      const markdown = `---
title: What's New in TypeScript 5.0?
platform: linkedin
status: draft
---
Check out the latest features`;

      const result = codec.fromMarkdown(markdown);

      expect(result.metadata?.["slug"]).not.toContain("'");
      expect(result.metadata?.["slug"]).not.toContain("?");
      expect(result.metadata?.["slug"]).toBe(
        "linkedin-whats-new-in-typescript-50",
      );
    });

    it("should handle long titles", () => {
      const markdown = `---
title: This Is A Very Long Title That Should Be Handled Properly
platform: linkedin
status: draft
---
Post content`;

      const result = codec.fromMarkdown(markdown);
      const slug = result.metadata?.["slug"];

      expect(slug).toBeDefined();
      expect(slug).toMatch(/^linkedin-/);
    });
  });
});
