import { describe, it, expect } from "bun:test";
import { socialPostAdapter } from "../src/adapters/social-post-adapter";
import type { SocialPost } from "../src/schemas/social-post";

/**
 * Regression tests for metadata/frontmatter synchronization
 *
 * These tests ensure that when entity.metadata is updated,
 * the serialized markdown (via toMarkdown) reflects those changes.
 *
 * Bug context: The adapter was reading frontmatter from entity.content
 * instead of using entity.metadata as the authoritative source.
 * This caused status updates to be lost when serializing.
 */
describe("SocialPostAdapter - Metadata/Frontmatter Sync", () => {
  const createTestEntity = (
    overrides: Partial<SocialPost> = {},
  ): SocialPost => ({
    id: "test-post-123",
    entityType: "social-post",
    content: `---
title: Test Post
platform: linkedin
status: draft
---
This is the post content.`,
    contentHash: "abc123",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:00:00Z",
    metadata: {
      title: "Test Post",
      slug: "linkedin-test-post-20240101",
      platform: "linkedin",
      status: "draft",
    },
    ...overrides,
  });

  describe("toMarkdown should use entity.metadata as authoritative source", () => {
    it("should reflect updated status in frontmatter when metadata.status changes", () => {
      // Create entity with draft status in content but published in metadata
      const entity = createTestEntity({
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published", // <-- UPDATED in metadata
          publishedAt: "2024-01-15T10:00:00Z",
        },
      });

      const markdown = socialPostAdapter.toMarkdown(entity);

      // The serialized markdown should have status: published (from metadata)
      expect(markdown).toContain("status: published");
      expect(markdown).not.toContain("status: draft");
    });

    it("should include publishedAt when present in metadata", () => {
      const entity = createTestEntity({
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published",
          publishedAt: "2024-01-15T10:00:00Z",
        },
      });

      const markdown = socialPostAdapter.toMarkdown(entity);

      // YAML may quote the timestamp
      expect(markdown).toMatch(/publishedAt:.*2024-01-15T10:00:00Z/);
    });

    it("should sync platformPostId from metadata to frontmatter", () => {
      const entity: SocialPost = {
        id: "test-post-123",
        entityType: "social-post",
        content: `---
title: Test Post
platform: linkedin
status: draft
---
This is the post content.`,
        contentHash: "abc123",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:00:00Z",
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published",
          platformPostId: "urn:li:share:123456789",
        },
      };

      const markdown = socialPostAdapter.toMarkdown(entity);

      // platformPostId should come from metadata
      expect(markdown).toMatch(/platformPostId:.*urn:li:share:123456789/);
      expect(markdown).toContain("status: published");
    });

    it("should update title in frontmatter when metadata.title changes", () => {
      const entity = createTestEntity({
        metadata: {
          title: "Updated Title", // <-- Different from content
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "draft",
        },
      });

      const markdown = socialPostAdapter.toMarkdown(entity);

      expect(markdown).toContain("title: Updated Title");
      expect(markdown).not.toContain("title: Test Post");
    });

    it("should not include removed operational fields in output", () => {
      const entity: SocialPost = {
        id: "test-post-123",
        entityType: "social-post",
        content: `---
title: Test Post
platform: linkedin
status: published
---
This is the post content.`,
        contentHash: "abc123",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:00:00Z",
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published",
        },
      };

      const markdown = socialPostAdapter.toMarkdown(entity);

      expect(markdown).toContain("status: published");
      expect(markdown).not.toContain("queueOrder:");
      expect(markdown).not.toContain("retryCount:");
      expect(markdown).not.toContain("lastError:");
    });

    it("should preserve coverImageId from frontmatter (frontmatter-only field)", () => {
      // coverImageId is frontmatter-only, not in metadata
      const entity: SocialPost = {
        id: "test-post-123",
        entityType: "social-post",
        content: `---
title: Test Post
platform: linkedin
status: draft
coverImageId: image-abc123
---
This is the post content.`,
        contentHash: "abc123",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:00:00Z",
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published", // Updated in metadata
        },
      };

      const markdown = socialPostAdapter.toMarkdown(entity);

      // coverImageId should be preserved from content
      expect(markdown).toContain("coverImageId: image-abc123");
      // status should come from metadata
      expect(markdown).toContain("status: published");
    });

    it("should preserve body content when updating metadata", () => {
      const entity = createTestEntity({
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published",
        },
      });

      const markdown = socialPostAdapter.toMarkdown(entity);

      expect(markdown).toContain("This is the post content.");
    });

    it("should preserve sourceEntityId from frontmatter (frontmatter-only field)", () => {
      const entity: SocialPost = {
        id: "test-post-123",
        entityType: "social-post",
        content: `---
title: Test Post
platform: linkedin
status: draft
sourceEntityId: post-abc123
sourceEntityType: post
---
This is the post content.`,
        contentHash: "abc123",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:00:00Z",
        metadata: {
          title: "Test Post",
          slug: "linkedin-test-post-20240101",
          platform: "linkedin",
          status: "published",
        },
      };

      const markdown = socialPostAdapter.toMarkdown(entity);

      expect(markdown).toContain("sourceEntityId: post-abc123");
      expect(markdown).toContain("sourceEntityType: post");
    });
  });

  describe("round-trip consistency", () => {
    it("should maintain consistency through fromMarkdown -> update metadata -> toMarkdown", () => {
      // Step 1: Parse original markdown
      const originalMarkdown = `---
title: Original Title
platform: linkedin
status: draft
---
Post body here.`;

      const parsed = socialPostAdapter.fromMarkdown(originalMarkdown);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata?.title).toBe("Original Title");
      expect(parsed.metadata?.platform).toBe("linkedin");
      expect(parsed.metadata?.slug).toBeDefined();

      // Step 2: Create entity and update metadata (simulating what entity service does)
      const entity: SocialPost = {
        id: "test-123",
        entityType: "social-post",
        content: originalMarkdown,
        contentHash: "hash",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:00:00Z",
        metadata: {
          title: parsed.metadata?.title ?? "Original Title",
          platform: parsed.metadata?.platform ?? "linkedin",
          slug: parsed.metadata?.slug ?? "test-slug",
          status: "published", // <-- Update status
          publishedAt: "2024-01-15T10:00:00Z",
        },
      };

      // Step 3: Serialize back to markdown
      const newMarkdown = socialPostAdapter.toMarkdown(entity);

      // Step 4: Verify the new markdown has the updated values
      expect(newMarkdown).toContain("status: published");
      // YAML may quote the timestamp
      expect(newMarkdown).toMatch(/publishedAt:.*2024-01-15T10:00:00Z/);
      expect(newMarkdown).toContain("Post body here.");
    });
  });
});
