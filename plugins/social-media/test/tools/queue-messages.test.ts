import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createQueueTool } from "../../src/tools/queue";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { SocialPost } from "../../src/schemas/social-post";

// Null tool context for tests
const nullToolContext = null as unknown as ToolContext;

// Sample post for testing
const sampleDraftPost: SocialPost = {
  id: "post-1",
  entityType: "social-post",
  content: `---
platform: linkedin
status: draft
---
This is a test post.`,
  metadata: {
    platform: "linkedin",
    status: "draft",
    slug: "test-post",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const sampleQueuedPost: SocialPost = {
  ...sampleDraftPost,
  content: `---
platform: linkedin
status: queued
queueOrder: 1
---
This is a test post.`,
  metadata: {
    ...sampleDraftPost.metadata,
    status: "queued",
    queueOrder: 1,
  },
};

describe("Queue Tool - Message Integration", () => {
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

  describe("add action", () => {
    it("should send publish:queue message when adding post to queue", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftPost));

      const tool = createQueueTool(context, "social-media");
      await tool.handler({ action: "add", postId: "post-1" }, nullToolContext);

      expect(sentMessages).toContainEqual({
        channel: "publish:queue",
        payload: { entityType: "social-post", entityId: "post-1" },
      });
    });

    it("should not send message if post is already queued", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedPost));

      const tool = createQueueTool(context, "social-media");
      const result = await tool.handler(
        { action: "add", postId: "post-1" },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(sentMessages).toHaveLength(0);
    });
  });

  describe("remove action", () => {
    it("should send publish:remove message when removing post from queue", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedPost));

      const tool = createQueueTool(context, "social-media");
      await tool.handler(
        { action: "remove", postId: "post-1" },
        nullToolContext,
      );

      expect(sentMessages).toContainEqual({
        channel: "publish:remove",
        payload: { entityType: "social-post", entityId: "post-1" },
      });
    });

    it("should not send message if post is not in queue", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftPost));

      const tool = createQueueTool(context, "social-media");
      const result = await tool.handler(
        { action: "remove", postId: "post-1" },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(sentMessages).toHaveLength(0);
    });
  });

  describe("reorder action", () => {
    it("should send publish:reorder message when reordering post", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedPost));

      const tool = createQueueTool(context, "social-media");
      await tool.handler(
        { action: "reorder", postId: "post-1", position: 3 },
        nullToolContext,
      );

      expect(sentMessages).toContainEqual({
        channel: "publish:reorder",
        payload: { entityType: "social-post", entityId: "post-1", position: 3 },
      });
    });
  });

  describe("list action", () => {
    it("should send publish:list message and wait for response", async () => {
      const tool = createQueueTool(context, "social-media");
      await tool.handler({ action: "list" }, nullToolContext);

      expect(sentMessages).toContainEqual({
        channel: "publish:list",
        payload: { entityType: "social-post" },
      });
    });
  });
});
