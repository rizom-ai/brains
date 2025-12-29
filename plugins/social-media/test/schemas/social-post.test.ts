import { describe, it, expect } from "bun:test";
import {
  socialPostFrontmatterSchema,
  socialPostMetadataSchema,
  socialPostSchema,
  platformSchema,
  socialPostStatusSchema,
  sourceEntityTypeSchema,
} from "../../src/schemas/social-post";

describe("Social Post Schemas", () => {
  describe("platformSchema", () => {
    it("should accept 'linkedin' as valid platform", () => {
      const result = platformSchema.safeParse("linkedin");
      expect(result.success).toBe(true);
    });

    it("should reject unknown platforms", () => {
      const result = platformSchema.safeParse("facebook");
      expect(result.success).toBe(false);
    });
  });

  describe("socialPostStatusSchema", () => {
    it("should accept valid statuses", () => {
      const validStatuses = ["draft", "queued", "published", "failed"];
      validStatuses.forEach((status) => {
        const result = socialPostStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid status", () => {
      const result = socialPostStatusSchema.safeParse("pending");
      expect(result.success).toBe(false);
    });
  });

  describe("sourceEntityTypeSchema", () => {
    it("should accept 'post' and 'deck'", () => {
      expect(sourceEntityTypeSchema.safeParse("post").success).toBe(true);
      expect(sourceEntityTypeSchema.safeParse("deck").success).toBe(true);
    });

    it("should reject 'summary'", () => {
      const result = sourceEntityTypeSchema.safeParse("summary");
      expect(result.success).toBe(false);
    });
  });

  describe("socialPostFrontmatterSchema", () => {
    it("should validate complete frontmatter", () => {
      const validFrontmatter = {
        content: "Check out my new blog post about TypeScript!",
        platform: "linkedin",
        status: "draft",
        queueOrder: 1,
        retryCount: 0,
      };
      const result = socialPostFrontmatterSchema.safeParse(validFrontmatter);
      expect(result.success).toBe(true);
    });

    it("should validate minimal frontmatter (only required fields)", () => {
      const minimalFrontmatter = {
        content: "Hello world!",
        platform: "linkedin",
        status: "draft",
      };
      const result = socialPostFrontmatterSchema.safeParse(minimalFrontmatter);
      expect(result.success).toBe(true);
    });

    it("should validate frontmatter with source entity reference", () => {
      const withSource = {
        content: "Read my latest article",
        platform: "linkedin",
        status: "queued",
        sourceEntityId: "post-123",
        sourceEntityType: "post",
        sourceUrl: "https://example.com/blog/my-article",
      };
      const result = socialPostFrontmatterSchema.safeParse(withSource);
      expect(result.success).toBe(true);
    });

    it("should validate frontmatter with deck source", () => {
      const withDeckSource = {
        content: "Check out my presentation",
        platform: "linkedin",
        status: "queued",
        sourceEntityId: "deck-456",
        sourceEntityType: "deck",
        sourceUrl: "https://example.com/decks/my-presentation",
      };
      const result = socialPostFrontmatterSchema.safeParse(withDeckSource);
      expect(result.success).toBe(true);
    });

    it("should validate frontmatter with error state", () => {
      const failedPost = {
        content: "This post failed to publish",
        platform: "linkedin",
        status: "failed",
        retryCount: 3,
        lastError: "API rate limit exceeded",
      };
      const result = socialPostFrontmatterSchema.safeParse(failedPost);
      expect(result.success).toBe(true);
    });

    it("should validate published frontmatter", () => {
      const published = {
        content: "Successfully published!",
        platform: "linkedin",
        status: "published",
        publishedAt: "2024-01-15T10:30:00Z",
        platformPostId: "urn:li:share:123456789",
      };
      const result = socialPostFrontmatterSchema.safeParse(published);
      expect(result.success).toBe(true);
    });

    it("should reject frontmatter without required content", () => {
      const noContent = {
        platform: "linkedin",
        status: "draft",
      };
      const result = socialPostFrontmatterSchema.safeParse(noContent);
      expect(result.success).toBe(false);
    });

    it("should reject invalid source entity type", () => {
      const invalidSource = {
        content: "Test",
        platform: "linkedin",
        status: "draft",
        sourceEntityType: "summary",
      };
      const result = socialPostFrontmatterSchema.safeParse(invalidSource);
      expect(result.success).toBe(false);
    });

    it("should default retryCount to 0", () => {
      const noRetryCount = {
        content: "Test",
        platform: "linkedin",
        status: "draft",
      };
      const result = socialPostFrontmatterSchema.parse(noRetryCount);
      expect(result.retryCount).toBe(0);
    });
  });

  describe("socialPostMetadataSchema", () => {
    it("should validate complete metadata", () => {
      const validMetadata = {
        slug: "my-linkedin-post",
        platform: "linkedin",
        status: "queued",
        queueOrder: 5,
      };
      const result = socialPostMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should validate published metadata with publishedAt", () => {
      const publishedMetadata = {
        slug: "published-post",
        platform: "linkedin",
        status: "published",
        publishedAt: "2024-01-15T10:30:00Z",
      };
      const result = socialPostMetadataSchema.safeParse(publishedMetadata);
      expect(result.success).toBe(true);
    });

    it("should validate minimal metadata", () => {
      const minimalMetadata = {
        slug: "test-post",
        platform: "linkedin",
        status: "draft",
      };
      const result = socialPostMetadataSchema.safeParse(minimalMetadata);
      expect(result.success).toBe(true);
    });

    it("should reject metadata without required slug", () => {
      const noSlug = {
        platform: "linkedin",
        status: "draft",
      };
      const result = socialPostMetadataSchema.safeParse(noSlug);
      expect(result.success).toBe(false);
    });

    it("should reject invalid datetime format for publishedAt", () => {
      const invalidDate = {
        slug: "test",
        platform: "linkedin",
        status: "published",
        publishedAt: "not-a-date",
      };
      const result = socialPostMetadataSchema.safeParse(invalidDate);
      expect(result.success).toBe(false);
    });
  });

  describe("socialPostSchema", () => {
    it("should validate complete entity", () => {
      const validEntity = {
        id: "social-post-123",
        entityType: "social-post",
        content:
          "---\ncontent: Hello\nplatform: linkedin\nstatus: draft\n---\n",
        metadata: {
          slug: "hello-post",
          platform: "linkedin",
          status: "draft",
        },
        contentHash: "abc123",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const result = socialPostSchema.safeParse(validEntity);
      expect(result.success).toBe(true);
    });

    it("should reject wrong entityType", () => {
      const wrongType = {
        id: "post-123",
        entityType: "post",
        content: "test",
        metadata: {
          slug: "test",
          platform: "linkedin",
          status: "draft",
        },
        contentHash: "abc123",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const result = socialPostSchema.safeParse(wrongType);
      expect(result.success).toBe(false);
    });

    it("should require metadata", () => {
      const noMetadata = {
        id: "social-post-123",
        entityType: "social-post",
        content: "test",
        contentHash: "abc123",
        created: "2024-01-15T10:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };
      const result = socialPostSchema.safeParse(noMetadata);
      expect(result.success).toBe(false);
    });
  });
});
