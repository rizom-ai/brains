import { describe, it, expect, beforeEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { BlogPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { createMockPost } from "./fixtures/blog-entities";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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

  describe("RSS staging", () => {
    it("writes feed.xml before publication and ignores completion notifications", async () => {
      await harness.installPlugin(new BlogPlugin({}));
      await harness
        .getEntityService()
        .createEntity({ entity: sampleDraftPost });
      const testDir = await fs.mkdtemp(join(tmpdir(), "blog-rss-staging-"));
      const stagingDir = join(testDir, "staging");
      const completedDir = join(testDir, "completed");
      await fs.mkdir(stagingDir, { recursive: true });
      await fs.mkdir(completedDir, { recursive: true });
      const payload = {
        environment: "preview" as const,
        routesBuilt: 1,
        siteConfig: {
          title: "Test Blog",
          description: "Test feed",
          url: "https://example.com",
        },
        generateEntityUrl: (_entityType: string, slug: string): string =>
          `/posts/${slug}`,
        reportFailure: (): void => {
          throw new Error("Did not expect a staging failure");
        },
      };

      try {
        await harness.sendMessage(
          "site:build:staging",
          { ...payload, outputDir: stagingDir },
          "site-builder",
          true,
        );
        expect(
          await fs.readFile(join(stagingDir, "feed.xml"), "utf8"),
        ).toContain("Test Post");

        await harness.sendMessage(
          "site:build:completed",
          { ...payload, outputDir: completedDir },
          "site-builder",
          true,
        );
        expect(
          await fs
            .access(join(completedDir, "feed.xml"))
            .then(() => true)
            .catch(() => false),
        ).toBe(false);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it("reports a staging failure instead of leaving the feed silently missing", async () => {
      // The message bus swallows subscriber errors on broadcast, so throwing
      // here would publish a generation with no feed and still report success.
      await harness.installPlugin(new BlogPlugin({}));
      await harness
        .getEntityService()
        .createEntity({ entity: sampleDraftPost });
      const testDir = await fs.mkdtemp(join(tmpdir(), "blog-rss-failure-"));
      const failures: string[] = [];

      try {
        await harness.sendMessage(
          "site:build:staging",
          {
            environment: "preview" as const,
            routesBuilt: 1,
            outputDir: join(testDir, "missing-generation"),
            siteConfig: {
              title: "Test Blog",
              description: "Test feed",
              url: "https://example.com",
            },
            generateEntityUrl: (_entityType: string, slug: string): string =>
              `/posts/${slug}`,
            reportFailure: (detail: string): void => {
              failures.push(detail);
            },
          },
          "site-builder",
          true,
        );

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain("RSS feed generation failed");
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
