import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins";

// Sample blog post for testing (using BaseEntity to avoid import)
const samplePublishedPost: BaseEntity = {
  id: "post-1",
  entityType: "post",
  content: `---
title: Test Blog Post
status: published
excerpt: A test blog post
author: Test Author
---
This is the content of the blog post.`,
  metadata: {
    title: "Test Blog Post",
    slug: "test-blog-post",
    status: "published",
    publishedAt: "2024-01-01T10:00:00Z",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T10:00:00Z",
};

describe("SocialMediaPlugin - Auto-Generate on Blog Queued", () => {
  let plugin: SocialMediaPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;
  let generationTriggered: boolean;
  let generationData: unknown;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({
      logger,
      dataDir: "/tmp/test-social-media",
    });
    generationTriggered = false;
    generationData = null;
  });

  afterEach(async () => {
    mock.restore();
  });

  describe("entity:updated subscription for queued status", () => {
    it("should not auto-generate when feature is disabled", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: false,
      });

      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Send entity:updated for a post with queued status
      await messageBus.send(
        "entity:updated",
        {
          entityType: "post",
          entityId: "post-1",
          entity: {
            ...samplePublishedPost,
            metadata: { ...samplePublishedPost.metadata, status: "queued" },
          },
        },
        "test",
      );

      expect(generationTriggered).toBe(false);
    });

    it("should auto-generate social post when blog post status changes to queued", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: true,
      });

      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Send entity:updated for a post with queued status
      await messageBus.send(
        "entity:updated",
        {
          entityType: "post",
          entityId: "post-1",
          entity: {
            ...samplePublishedPost,
            metadata: { ...samplePublishedPost.metadata, status: "queued" },
          },
        },
        "test",
      );

      expect(generationTriggered).toBe(true);
      expect(generationData).toMatchObject({
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        platform: "linkedin",
      });
    });

    it("should not auto-generate when post status is not queued", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: true,
      });

      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Send entity:updated for a post with draft status
      await messageBus.send(
        "entity:updated",
        {
          entityType: "post",
          entityId: "post-1",
          entity: {
            ...samplePublishedPost,
            metadata: { ...samplePublishedPost.metadata, status: "draft" },
          },
        },
        "test",
      );

      expect(generationTriggered).toBe(false);
    });

    it("should skip non-post entity types", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: true,
      });

      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Send entity:updated for a deck with queued status
      await messageBus.send(
        "entity:updated",
        {
          entityType: "deck",
          entityId: "deck-1",
          entity: {
            id: "deck-1",
            entityType: "deck",
            metadata: { status: "queued" },
          },
        },
        "test",
      );

      expect(generationTriggered).toBe(false);
    });

    it("should not auto-generate if social post already exists for this source", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: true,
      });

      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Create existing social post linked to this blog post
      const entityService = mockShell.getEntityService();
      await entityService.createEntity({
        id: "social-post-1",
        entityType: "social-post",
        content: "Existing social post",
        metadata: {
          platform: "linkedin",
          status: "draft",
          sourceEntityType: "post",
          sourceEntityId: "post-1",
        },
      });

      // Send entity:updated for the blog post with queued status
      await messageBus.send(
        "entity:updated",
        {
          entityType: "post",
          entityId: "post-1",
          entity: {
            ...samplePublishedPost,
            metadata: { ...samplePublishedPost.metadata, status: "queued" },
          },
        },
        "test",
      );

      expect(generationTriggered).toBe(false);
    });
  });
});
