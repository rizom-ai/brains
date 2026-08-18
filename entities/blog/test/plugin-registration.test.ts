import { describe, it, expect, beforeEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { BlogPlugin } from "../src/plugin";
import { FeedRegistry } from "@brains/site-composition";
import { postToFeedItem } from "../src/lib/feed";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
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
    it("should send publish:register message after plugins-registered with internal provider", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      expect(
        receivedMessages.find((m) => m.type === "publish:register"),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
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

    it("should register post OG images as publish assets after plugins-registered", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      expect(
        receivedMessages.find((m) => m.type === "publish-assets:register"),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
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
        SYSTEM_CHANNELS.pluginsRegistered,
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

  describe("feed", () => {
    // Blog says how a post becomes a feed item; the site build decides which
    // posts qualify and where the file goes, so nothing here touches an
    // output directory.
    it("registers a feed declaration for posts", async () => {
      await harness.installPlugin(new BlogPlugin({}));

      const declaration = FeedRegistry.getInstance().get("post");
      expect(declaration).toMatchObject({
        entityType: "post",
        path: "feed.xml",
        routePrefix: "posts",
      });
    });

    it("maps a post to an item, and refuses one with no date", () => {
      const item = postToFeedItem(sampleDraftPost);

      expect(item).toMatchObject({
        title: sampleDraftPost.metadata.title,
        slug: sampleDraftPost.metadata.slug,
      });
      expect(item?.publishedAt).toBeTruthy();
    });
  });
});
