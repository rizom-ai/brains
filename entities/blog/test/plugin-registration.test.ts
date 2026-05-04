import { describe, it, expect, beforeEach } from "bun:test";
import { BlogPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { BlogPost } from "../src/schemas/blog-post";
import { createMockPost } from "./fixtures/blog-entities";

const sampleDraftPost = createMockPost(
  "post-1",
  "Test Post",
  "test-post",
  "draft",
);

describe("BlogPlugin - Publish Pipeline Integration", () => {
  let harness: PluginTestHarness<BlogPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<BlogPlugin>({ dataDir: "/tmp/test-blog" });
    receivedMessages = [];

    for (const eventType of [
      "publish:register",
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with internal provider", async () => {
      await harness.installPlugin(new BlogPlugin({}));

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
      await harness.installPlugin(new BlogPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "non-existent",
      });

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
    });

    it("should report failure when entity not found", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "non-existent",
      });

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
      await harness.installPlugin(new BlogPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "post-1",
      });

      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });

    it("should report success when publishing draft post", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      const entityService = harness.getEntityService();
      await entityService.createEntity(sampleDraftPost);

      await harness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "post-1",
      });

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "post",
        entityId: "post-1",
      });

      const updatedPost = await entityService.getEntity<BlogPost>({
        entityType: "post",
        id: "post-1",
      });
      expect(updatedPost?.metadata.status).toBe("published");
    });

    it("should skip already published posts", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      const publishedPost = createMockPost(
        "post-1",
        "Test Post",
        "test-post",
        "published",
        { publishedAt: "2025-01-01T00:00:00.000Z" },
      );

      const entityService = harness.getEntityService();
      await entityService.createEntity(publishedPost);

      await harness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "post-1",
      });

      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });
  });
});
