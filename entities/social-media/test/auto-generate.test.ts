import { describe, it, expect, beforeEach } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins";

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
  let harness: PluginTestHarness<SocialMediaPlugin>;
  let generationTriggered: boolean;
  let generationData: unknown;

  beforeEach(async () => {
    harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-social-media",
    });
    generationTriggered = false;
    generationData = null;
  });

  describe("entity:updated subscription for queued status", () => {
    it("should not auto-generate when feature is disabled", async () => {
      harness.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await harness.installPlugin(
        new SocialMediaPlugin({ autoGenerateOnBlogPublish: false }),
      );

      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "post-1",
        entity: {
          ...samplePublishedPost,
          metadata: { ...samplePublishedPost.metadata, status: "queued" },
        },
      });

      expect(generationTriggered).toBe(false);
    });

    it("should auto-generate social post when blog post status changes to queued", async () => {
      harness.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await harness.installPlugin(
        new SocialMediaPlugin({ autoGenerateOnBlogPublish: true }),
      );

      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "post-1",
        entity: {
          ...samplePublishedPost,
          metadata: { ...samplePublishedPost.metadata, status: "queued" },
        },
      });

      expect(generationTriggered).toBe(true);
      expect(generationData).toMatchObject({
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        platform: "linkedin",
      });
    });

    it("should not auto-generate when post status is not queued", async () => {
      harness.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await harness.installPlugin(
        new SocialMediaPlugin({ autoGenerateOnBlogPublish: true }),
      );

      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "post-1",
        entity: {
          ...samplePublishedPost,
          metadata: { ...samplePublishedPost.metadata, status: "draft" },
        },
      });

      expect(generationTriggered).toBe(false);
    });

    it("should skip non-post entity types", async () => {
      harness.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await harness.installPlugin(
        new SocialMediaPlugin({ autoGenerateOnBlogPublish: true }),
      );

      await harness.sendMessage("entity:updated", {
        entityType: "deck",
        entityId: "deck-1",
        entity: {
          id: "deck-1",
          entityType: "deck",
          metadata: { status: "queued" },
        },
      });

      expect(generationTriggered).toBe(false);
    });

    it("should not auto-generate if social post already exists for this source", async () => {
      harness.subscribe("social:auto-generate", async (msg) => {
        generationTriggered = true;
        generationData = msg.payload;
        return { success: true };
      });

      await harness.installPlugin(
        new SocialMediaPlugin({ autoGenerateOnBlogPublish: true }),
      );

      const entityService = harness.getEntityService();
      await entityService.createEntity({
        entity: {
          id: "social-post-1",
          entityType: "social-post",
          content: "Existing social post",
          metadata: {
            platform: "linkedin",
            status: "draft",
            sourceEntityType: "post",
            sourceEntityId: "post-1",
          },
        },
      });

      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "post-1",
        entity: {
          ...samplePublishedPost,
          metadata: { ...samplePublishedPost.metadata, status: "queued" },
        },
      });

      expect(generationTriggered).toBe(false);
    });
  });
});
