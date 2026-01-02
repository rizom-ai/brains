import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { BlogPlugin } from "../src/plugin";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";
import type { BlogPost } from "../src/schemas/blog-post";

// Sample post for testing
const sampleDraftPost: BlogPost = {
  id: "post-1",
  entityType: "post",
  content: `---
title: Test Post
status: draft
excerpt: A test post
author: Test Author
---
This is a test post.`,
  metadata: {
    title: "Test Post",
    slug: "test-post",
    status: "draft",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

describe("BlogPlugin - Publish Pipeline Integration", () => {
  let plugin: BlogPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-blog" });
    receivedMessages = [];

    // Capture publish messages
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
    messageBus.subscribe("publish:report:success", async (msg) => {
      receivedMessages.push({
        type: "publish:report:success",
        payload: msg.payload,
      });
      return { success: true };
    });
    messageBus.subscribe("publish:report:failure", async (msg) => {
      receivedMessages.push({
        type: "publish:report:failure",
        payload: msg.payload,
      });
      return { success: true };
    });
  });

  afterEach(async () => {
    mock.restore();
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with internal provider", async () => {
      plugin = new BlogPlugin({});
      await plugin.register(mockShell);

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "post",
        provider: { name: "internal" },
      });
    });
  });

  describe("publish:execute handler", () => {
    it("should subscribe to publish:execute messages", async () => {
      plugin = new BlogPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      const response = await messageBus.send(
        "publish:execute",
        { entityType: "post", entityId: "non-existent" },
        "test",
      );

      expect(response).toMatchObject({ success: true });
    });

    it("should report failure when entity not found", async () => {
      plugin = new BlogPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "post", entityId: "non-existent" },
        "test",
      );

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
      expect(failureMessage?.payload).toMatchObject({
        entityType: "post",
        entityId: "non-existent",
      });
    });

    it("should skip non-post entity types", async () => {
      plugin = new BlogPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "social-post", entityId: "post-1" },
        "test",
      );

      // No report messages for other entity types
      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });

    it("should report success when publishing draft post", async () => {
      plugin = new BlogPlugin({});
      await plugin.register(mockShell);

      // Add draft post
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(sampleDraftPost);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "post", entityId: "post-1" },
        "test",
      );

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "post",
        entityId: "post-1",
      });

      // Verify post was updated to published
      const updatedPost = await entityService.getEntity<BlogPost>(
        "post",
        "post-1",
      );
      expect(updatedPost?.metadata.status).toBe("published");
    });

    it("should skip already published posts", async () => {
      plugin = new BlogPlugin({});
      await plugin.register(mockShell);

      // Add published post
      const publishedPost: BlogPost = {
        ...sampleDraftPost,
        content: sampleDraftPost.content.replace(
          "status: draft",
          "status: published",
        ),
        metadata: { ...sampleDraftPost.metadata, status: "published" },
      };
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(publishedPost);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "post", entityId: "post-1" },
        "test",
      );

      // No report messages for already published
      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });
  });
});
