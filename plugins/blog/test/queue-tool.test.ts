import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createQueueTool } from "../src/tools/queue";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { BlogPost } from "../src/schemas/blog-post";

// Null tool context for tests
const nullToolContext = null as unknown as ToolContext;

// Sample posts for testing
const sampleQueuedPost: BlogPost = {
  id: "post-1",
  entityType: "post",
  content: `---
title: Test Post
status: queued
excerpt: A test post
author: Test Author
---
This is a test post.`,
  metadata: {
    title: "Test Post",
    slug: "test-post",
    status: "queued",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const sampleDraftPost: BlogPost = {
  ...sampleQueuedPost,
  id: "post-2",
  content: sampleQueuedPost.content.replace("status: queued", "status: draft"),
  metadata: { ...sampleQueuedPost.metadata, status: "draft" },
};

describe("Blog Queue Tool", () => {
  let context: ServicePluginContext;
  let sentMessages: Array<{ channel: string; payload: unknown }>;

  beforeEach(() => {
    sentMessages = [];

    context = {
      entityService: {
        getEntity: mock(() => Promise.resolve(null)),
        listEntities: mock(() => Promise.resolve([])),
        updateEntity: mock(() => Promise.resolve({ entityId: "post-1" })),
      },
      sendMessage: mock(async (channel: string, payload: unknown) => {
        sentMessages.push({ channel, payload });
        return { success: true };
      }),
    } as unknown as ServicePluginContext;
  });

  describe("list action", () => {
    it("should send publish:list message", async () => {
      const tool = createQueueTool(context, "blog");
      await tool.handler({ action: "list" }, nullToolContext);

      expect(sentMessages).toContainEqual({
        channel: "publish:list",
        payload: { entityType: "post" },
      });
    });

    it("should return queued posts from local query", async () => {
      (
        context.entityService.listEntities as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve([sampleQueuedPost]));

      const tool = createQueueTool(context, "blog");
      const result = await tool.handler({ action: "list" }, nullToolContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe("remove action", () => {
    it("should send publish:remove message for queued post", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedPost));

      const tool = createQueueTool(context, "blog");
      await tool.handler({ action: "remove", id: "post-1" }, nullToolContext);

      expect(sentMessages).toContainEqual({
        channel: "publish:remove",
        payload: { entityType: "post", entityId: "post-1" },
      });
    });

    it("should not send message if post is not queued", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftPost));

      const tool = createQueueTool(context, "blog");
      const result = await tool.handler(
        { action: "remove", id: "post-2" },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not in queue");
      expect(sentMessages).toHaveLength(0);
    });

    it("should return error if post not found", async () => {
      const tool = createQueueTool(context, "blog");
      const result = await tool.handler(
        { action: "remove", id: "nonexistent" },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not found");
    });
  });

  describe("reorder action", () => {
    it("should send publish:reorder message for queued post", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedPost));

      const tool = createQueueTool(context, "blog");
      await tool.handler(
        { action: "reorder", id: "post-1", position: 3 },
        nullToolContext,
      );

      expect(sentMessages).toContainEqual({
        channel: "publish:reorder",
        payload: { entityType: "post", entityId: "post-1", position: 3 },
      });
    });

    it("should require position for reorder", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedPost));

      const tool = createQueueTool(context, "blog");
      const result = await tool.handler(
        { action: "reorder", id: "post-1" },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("Position");
    });

    it("should not reorder non-queued posts", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftPost));

      const tool = createQueueTool(context, "blog");
      const result = await tool.handler(
        { action: "reorder", id: "post-2", position: 1 },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not in queue");
    });
  });

  describe("lookup by slug", () => {
    it("should find post by slug for remove action", async () => {
      (
        context.entityService.listEntities as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve([sampleQueuedPost]));

      const tool = createQueueTool(context, "blog");
      await tool.handler(
        { action: "remove", slug: "test-post" },
        nullToolContext,
      );

      expect(sentMessages).toContainEqual({
        channel: "publish:remove",
        payload: { entityType: "post", entityId: "post-1" },
      });
    });
  });
});
