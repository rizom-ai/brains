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

describe("SocialMediaPlugin - Auto-Generate on Blog Publish", () => {
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

  describe("publish:completed subscription", () => {
    it("should not auto-generate when feature is disabled", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: false,
      });

      // Track if social:auto-generate message is sent
      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Add blog post to entity service
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(samplePublishedPost);

      // Send publish:completed message
      await messageBus.send(
        "publish:completed",
        {
          entityType: "post",
          entityId: "post-1",
          publishedAt: "2024-01-01T10:00:00Z",
        },
        "test",
      );

      // Generation should not be triggered
      expect(generationTriggered).toBe(false);
    });

    it("should auto-generate social post when blog post is published", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: true,
      });

      // Track if social:auto-generate message is sent
      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Add blog post to entity service
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(samplePublishedPost);

      // Send publish:completed message
      await messageBus.send(
        "publish:completed",
        {
          entityType: "post",
          entityId: "post-1",
          publishedAt: "2024-01-01T10:00:00Z",
        },
        "test",
      );

      // Generation should be triggered
      expect(generationTriggered).toBe(true);
      expect(generationData).toMatchObject({
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        platform: "linkedin",
      });
    });

    it("should skip non-post entity types", async () => {
      plugin = new SocialMediaPlugin({
        autoGenerateOnBlogPublish: true,
      });

      // Track if social:auto-generate message is sent
      const messageBus = mockShell.getMessageBus();
      messageBus.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await plugin.register(mockShell);

      // Send publish:completed for a deck
      await messageBus.send(
        "publish:completed",
        {
          entityType: "deck",
          entityId: "deck-1",
          publishedAt: "2024-01-01T10:00:00Z",
        },
        "test",
      );

      // Generation should not be triggered
      expect(generationTriggered).toBe(false);
    });
  });
});
