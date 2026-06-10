import { describe, it, expect, beforeEach } from "bun:test";
import { BlogPlugin } from "../src/plugin";
import { PermissionService } from "@brains/templates";
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
      "publish-assets:register",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("entity policy registration", () => {
    it("declares post publish statuses", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      expect(
        harness.getEntityRegistry().getEntityTypeConfig("post").publish,
      ).toEqual({
        publishStatuses: ["queued", "published"],
      });
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after system:plugins:ready with internal provider", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      expect(
        receivedMessages.find((m) => m.type === "publish:register"),
      ).toBeUndefined();

      await harness.sendMessage(
        "system:plugins:ready",
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "post",
        provider: { name: "internal" },
      });
    });

    it("should register post OG images as publish assets after system:plugins:ready", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      expect(
        receivedMessages.find((m) => m.type === "publish-assets:register"),
      ).toBeUndefined();

      await harness.sendMessage(
        "system:plugins:ready",
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish-assets:register",
      );
      expect(registerMessage?.payload).toMatchObject({
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
        jobType: "image:image-render-source",
      });
    });

    it("delivers deferred publish registrations to subscribers installed after blog", async () => {
      const localHarness = createPluginHarness<BlogPlugin>({
        dataDir: "/tmp/test-blog-late-publish-subscriber",
      });
      await localHarness.installPlugin(new BlogPlugin({}));
      const lateMessages: Array<{ type: string; payload: unknown }> = [];
      for (const eventType of ["publish:register", "publish-assets:register"]) {
        localHarness.subscribe(eventType, async (msg) => {
          lateMessages.push({ type: eventType, payload: msg.payload });
          return { success: true };
        });
      }

      await localHarness.sendMessage(
        "system:plugins:ready",
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      expect(lateMessages.map((m) => m.type).sort()).toEqual([
        "publish-assets:register",
        "publish:register",
      ]);
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

    it("requires publish permission before publishing a draft post", async () => {
      const localHarness = createPluginHarness<BlogPlugin>({
        dataDir: "/tmp/test-blog-permissions",
      });
      localHarness.setPermissionService(
        new PermissionService({
          entityActions: { post: { publish: "anchor" } },
        }),
      );
      const messages: Array<{ type: string; payload: unknown }> = [];
      localHarness.subscribe("publish:report:failure", async (msg) => {
        messages.push({ type: "publish:report:failure", payload: msg.payload });
        return { success: true };
      });
      await localHarness.installPlugin(new BlogPlugin({}));
      const entityService = localHarness.getEntityService();
      await entityService.createEntity({ entity: sampleDraftPost });

      await localHarness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "post-1",
        authContext: { userPermissionLevel: "trusted" },
      });

      const updatedPost = await entityService.getEntity<BlogPost>({
        entityType: "post",
        id: "post-1",
      });
      expect(updatedPost?.metadata.status).toBe("draft");
      expect(messages[0]?.payload).toMatchObject({
        entityType: "post",
        entityId: "post-1",
      });
    });

    it("should report success when publishing draft post", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      const entityService = harness.getEntityService();
      await entityService.createEntity({ entity: sampleDraftPost });

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
      await entityService.createEntity({ entity: publishedPost });

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
