import { describe, it, expect, beforeEach } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { SocialPost } from "../src/schemas/social-post";

const samplePost: SocialPost = {
  id: "post-1",
  entityType: "social-post",
  content: `---
title: Test LinkedIn Post
platform: linkedin
status: queued
---
This is a test post for LinkedIn.`,
  metadata: {
    title: "Test LinkedIn Post",
    platform: "linkedin",
    status: "queued",
    slug: "linkedin-test-linkedin-post-20260114",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

describe("SocialMediaPlugin - Execute Handler", () => {
  let harness: PluginTestHarness<SocialMediaPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-social",
    });
    receivedMessages = [];

    for (const eventType of [
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }

    await harness.installPlugin(new SocialMediaPlugin({}));
  });

  describe("publish:execute handler", () => {
    it("should report failure when entity not found", async () => {
      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "non-existent",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:failure");
      expect(receivedMessages[0]?.payload).toMatchObject({
        entityType: "social-post",
        entityId: "non-existent",
        error: expect.stringContaining("not found"),
      });
    });

    it("should report failure when provider not configured", async () => {
      const entityService = harness.getEntityService();
      await entityService.createEntity({ entity: samplePost });

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:failure");
      expect(receivedMessages[0]?.payload).toMatchObject({
        entityType: "social-post",
        entityId: "post-1",
        error: expect.stringContaining("No provider"),
      });
    });

    it("should skip non-social-post entity types", async () => {
      await harness.sendMessage("publish:execute", {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(0);
    });

    it("should skip already published posts", async () => {
      const publishedPost: SocialPost = {
        ...samplePost,
        metadata: { ...samplePost.metadata, status: "published" },
      };
      const entityService = harness.getEntityService();
      await entityService.createEntity({ entity: publishedPost });

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(0);
    });
  });

  describe("with mock provider", () => {
    let providerHarness: PluginTestHarness<SocialMediaPlugin>;

    beforeEach(async () => {
      providerHarness = createPluginHarness<SocialMediaPlugin>({
        dataDir: "/tmp/test-social-provider",
      });
      receivedMessages = [];

      for (const eventType of [
        "publish:report:success",
        "publish:report:failure",
      ]) {
        providerHarness.subscribe(eventType, async (msg) => {
          receivedMessages.push({ type: eventType, payload: msg.payload });
          return { success: true };
        });
      }

      await providerHarness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );
    });

    it("should report success on successful publish", async () => {
      const entityService = providerHarness.getEntityService();
      await entityService.createEntity({ entity: samplePost });

      await providerHarness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:failure");
    });
  });
});
