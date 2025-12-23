import type { mock } from "bun:test";
import { describe, it, expect, beforeEach } from "bun:test";
import { createPublishTool } from "../src/tools/publish";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { BlogPost } from "../src/schemas/blog-post";
import { computeContentHash } from "@brains/utils";
import { createMockServicePluginContext } from "@brains/test-utils";

// Mock ToolContext for handler calls
const mockToolContext: ToolContext = {
  userId: "test-user",
  interfaceType: "test",
};

describe("Publish Tool", () => {
  let mockContext: ServicePluginContext;
  let publishTool: ReturnType<typeof createPublishTool>;

  const createMockPost = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "published",
    publishedAt?: string,
  ): BlogPost => {
    const content = `---
title: ${title}
slug: ${slug}
status: ${status}
${publishedAt ? `publishedAt: "${publishedAt}"` : ""}
excerpt: Test excerpt
author: Test Author
---

# ${title}

Post content here`;
    return {
      id,
      entityType: "post",
      content,
      contentHash: computeContentHash(content),
      created: "2025-01-01T10:00:00.000Z",
      updated: "2025-01-01T10:00:00.000Z",
      metadata: {
        title,
        slug,
        status,
        publishedAt,
      },
    };
  };

  beforeEach(() => {
    mockContext = createMockServicePluginContext({
      returns: {
        entityService: {
          getEntity: null,
          listEntities: [],
        },
      },
    });

    publishTool = createPublishTool(mockContext, "blog");
  });

  describe("tool metadata", () => {
    it("should have correct tool name", () => {
      expect(publishTool.name).toBe("blog_publish");
    });

    it("should have descriptive description", () => {
      expect(publishTool.description).toContain("Publish");
      expect(publishTool.description).toContain("blog post");
    });

    it("should have correct input schema", () => {
      expect(publishTool.inputSchema).toBeDefined();
      expect(publishTool.inputSchema["id"]).toBeDefined();
    });
  });

  describe("publishing draft posts", () => {
    it("should publish a draft post successfully", async () => {
      const draftPost = createMockPost(
        "test-post",
        "My Draft Post",
        "my-draft-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(draftPost));

      const result = await publishTool.handler(
        { id: "test-post" },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("published successfully");
      expect(result.message).toContain("My Draft Post");

      // Verify updateEntity was called
      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      expect(updateCall).toBeDefined();

      const updatedPost = updateCall?.[0] as BlogPost;
      expect(updatedPost.id).toBe("test-post");
      expect(updatedPost.metadata.status).toBe("published");
      expect(updatedPost.metadata.publishedAt).toBeDefined();
    });

    it("should set publishedAt timestamp when publishing", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );
      const beforePublish = new Date().toISOString();

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(draftPost));

      await publishTool.handler({ id: "test-post" }, mockToolContext);

      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      if (!updateCall) throw new Error("updateEntity not called");
      const updatedPost = updateCall[0] as BlogPost;

      expect(updatedPost.metadata.publishedAt).toBeDefined();
      const publishedAt = updatedPost.metadata.publishedAt;
      if (!publishedAt) throw new Error("publishedAt not set");
      expect(new Date(publishedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforePublish).getTime(),
      );
    });

    it("should update frontmatter with published status", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);

      await publishTool.handler({ id: "test-post" }, mockToolContext);

      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedPost = updateCall?.[0] as BlogPost;

      // Content should have updated frontmatter
      expect(updatedPost.content).toContain("status: published");
      expect(updatedPost.content).toContain("publishedAt:");
    });

    it("should preserve existing post content and metadata", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);

      await publishTool.handler({ id: "test-post" }, mockToolContext);

      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedPost = updateCall?.[0] as BlogPost;

      // Check that original content is preserved
      expect(updatedPost.content).toContain("# Test Post");
      expect(updatedPost.content).toContain("Post content here");
      expect(updatedPost.metadata.title).toBe("Test Post");
    });
  });

  describe("re-publishing published posts", () => {
    it("should update publishedAt when re-publishing", async () => {
      const publishedPost = createMockPost(
        "test-post",
        "Published Post",
        "published-post",
        "published",
        "2025-01-01T10:00:00.000Z",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(publishedPost);

      const beforePublish = new Date().toISOString();

      await publishTool.handler({ id: "test-post" }, mockToolContext);

      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedPost = updateCall?.[0] as BlogPost;

      // Should have new publishedAt timestamp
      expect(updatedPost.metadata.publishedAt).not.toBe(
        "2025-01-01T10:00:00.000Z",
      );
      const publishedAt = updatedPost.metadata.publishedAt ?? "";
      expect(new Date(publishedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforePublish).getTime(),
      );
    });
  });

  describe("error handling", () => {
    it("should return error when post not found", async () => {
      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      const result = await publishTool.handler(
        { id: "nonexistent" },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not found");
      expect(result["error"]).toContain("nonexistent");
    });

    it("should return error when post has no content", async () => {
      const invalidPost = {
        id: "test-post",
        entityType: "post",
        content: "",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T10:00:00.000Z",
        metadata: { title: "Test", slug: "test", status: "draft" },
      };

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(invalidPost);

      const result = await publishTool.handler(
        { id: "test-post" },
        mockToolContext,
      );

      // Should fail due to invalid frontmatter parsing
      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should handle updateEntity errors gracefully", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);
      (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mockRejectedValue(new Error("Database error"));

      const result = await publishTool.handler(
        { id: "test-post" },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("Database error");
    });

    it("should validate input schema", async () => {
      const result = await publishTool.handler({}, mockToolContext);

      expect(result.success).toBe(false);
      expect(result["error"]).toContain(
        "Either 'id' or 'slug' must be provided",
      );
    });

    it("should handle invalid input gracefully", async () => {
      const result = await publishTool.handler({ id: 123 }, mockToolContext); // Wrong type

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });
  });

  describe("publish by slug", () => {
    it("should publish a post by slug", async () => {
      const draftPost = createMockPost(
        "test-post",
        "My Draft Post",
        "my-draft-post",
        "draft",
      );

      (
        mockContext.entityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([draftPost]);

      const result = await publishTool.handler(
        { slug: "my-draft-post" },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("published successfully");
      expect(result.message).toContain("My Draft Post");

      // Verify updateEntity was called
      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      expect(updateCall).toBeDefined();

      const updatedPost = updateCall?.[0] as BlogPost;
      expect(updatedPost.metadata.status).toBe("published");
      expect(updatedPost.metadata.publishedAt).toBeDefined();
    });

    it("should return error when slug not found", async () => {
      (
        mockContext.entityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const result = await publishTool.handler(
        { slug: "nonexistent-slug" },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not found");
      expect(result["error"]).toContain("nonexistent-slug");
    });

    it("should prefer id over slug when both provided", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);

      await publishTool.handler(
        { id: "test-post", slug: "other-slug" },
        mockToolContext,
      );

      // Should call getEntity (for ID lookup), not listEntities (for slug lookup)
      expect(
        (mockContext.entityService.getEntity as ReturnType<typeof mock>).mock
          .calls.length,
      ).toBe(1);
      expect(
        (mockContext.entityService.listEntities as ReturnType<typeof mock>).mock
          .calls.length,
      ).toBe(0);
    });
  });

  describe("series posts", () => {
    it("should preserve series metadata when publishing", async () => {
      const seriesContent = `---
title: Series Part 1
status: draft
excerpt: Test excerpt
author: Test Author
seriesName: My Series
seriesIndex: 1
---

# Series Part 1

Content`;
      const seriesPost: BlogPost = {
        id: "series-post",
        entityType: "post",
        content: seriesContent,
        contentHash: computeContentHash(seriesContent),
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T10:00:00.000Z",
        metadata: {
          title: "Series Part 1",
          slug: "series-part-1",
          status: "draft",
          seriesName: "My Series",
          seriesIndex: 1,
        },
      };

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(seriesPost);

      await publishTool.handler({ id: "series-post" }, mockToolContext);

      const updateCall = (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedPost = updateCall?.[0] as BlogPost;

      expect(updatedPost.metadata.seriesName).toBe("My Series");
      expect(updatedPost.metadata.seriesIndex).toBe(1);
      expect(updatedPost.content).toContain("seriesName: My Series");
      expect(updatedPost.content).toContain("seriesIndex: 1");
    });
  });

  describe("integration with messaging system", () => {
    it("should trigger entity:updated message via updateEntity", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);

      await publishTool.handler({ id: "test-post" }, mockToolContext);

      // Verify updateEntity was called (which triggers entity:updated)
      expect(
        (mockContext.entityService.updateEntity as ReturnType<typeof mock>).mock
          .calls.length,
      ).toBe(1);
    });

    it("should not directly enqueue site-build job", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);

      await publishTool.handler({ id: "test-post" }, mockToolContext);

      // Should NOT call enqueueJob (relies on entity:updated message instead)
      expect(
        (mockContext.enqueueJob as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(0);
    });
  });

  describe("return data", () => {
    it("should return updated post data on success", async () => {
      const draftPost = createMockPost(
        "test-post",
        "Test Post",
        "test-post",
        "draft",
      );

      (
        mockContext.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(draftPost);
      (
        mockContext.entityService.updateEntity as ReturnType<typeof mock>
      ).mockResolvedValue({
        entityId: "test-post",
        entity: draftPost,
      });

      const result = await publishTool.handler(
        { id: "test-post" },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>)["post"]).toBeDefined();
      expect(
        ((result.data as Record<string, unknown>)["post"] as BlogPost).id,
      ).toBe("test-post");
    });
  });
});
