import { describe, it, expect, beforeEach } from "bun:test";
import {
  publishAssetRegisterContract,
  publishRegisterContract,
  siteBuildStagingContract,
} from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { blogPlugin, type BlogEntityPlugin } from "./blog-plugin";
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

describe("the blog in the publish pipeline and the site build", () => {
  let harness: PluginTestHarness<BlogEntityPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<BlogEntityPlugin>({
      dataDir: "/tmp/test-blog",
    });
    receivedMessages = [];

    for (const eventType of [
      publishRegisterContract.name,
      publishAssetRegisterContract.name,
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("entity policy registration", () => {
    it("declares newest-published-first list ordering", async () => {
      await harness.installPlugin(blogPlugin());
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("post").defaultSort,
      ).toEqual([{ field: "publishedAt", direction: "desc" }]);
    });

    it("retires frontmatter fields posts no longer use", async () => {
      await harness.installPlugin(blogPlugin());
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("post").retiredFields,
      ).toEqual(["ogDescription", "twitterCard", "atprotoUri"]);
    });

    it("declares post publish statuses", async () => {
      await harness.installPlugin(blogPlugin());

      expect(
        harness.getEntityRegistry().getEntityTypeConfig("post").publish,
      ).toEqual({
        publishStatuses: ["queued", "published"],
      });
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with internal provider", async () => {
      await harness.installPlugin(blogPlugin());

      expect(
        receivedMessages.find((m) => m.type === publishRegisterContract.name),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === publishRegisterContract.name,
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "post",
        provider: { name: "internal" },
      });
    });

    it("should register post OG images as publish assets after plugins-registered", async () => {
      await harness.installPlugin(blogPlugin());

      expect(
        receivedMessages.find(
          (m) => m.type === publishAssetRegisterContract.name,
        ),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === publishAssetRegisterContract.name,
      );
      expect(registerMessage?.payload).toMatchObject({
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
      });
    });

    it("delivers deferred publish registrations to subscribers installed after blog", async () => {
      const localHarness = createPluginHarness<BlogEntityPlugin>({
        dataDir: "/tmp/test-blog-late-publish-subscriber",
      });
      await localHarness.installPlugin(blogPlugin());
      const lateMessages: Array<{ type: string; payload: unknown }> = [];
      for (const eventType of [
        publishRegisterContract.name,
        publishAssetRegisterContract.name,
      ]) {
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
        publishAssetRegisterContract.name,
        publishRegisterContract.name,
      ]);
    });
  });

  describe("RSS staging", () => {
    it("writes feed.xml before publication", async () => {
      await harness.installPlugin(blogPlugin());
      await harness
        .getEntityService()
        .createEntity({ entity: sampleDraftPost });
      const testDir = await fs.mkdtemp(join(tmpdir(), "blog-rss-staging-"));
      const stagingDir = join(testDir, "staging");
      await fs.mkdir(stagingDir, { recursive: true });
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
          siteBuildStagingContract.name,
          { ...payload, outputDir: stagingDir },
          "site-builder",
          true,
        );
        expect(
          await fs.readFile(join(stagingDir, "feed.xml"), "utf8"),
        ).toContain("Test Post");
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it("reports a staging failure instead of leaving the feed silently missing", async () => {
      // The message bus swallows subscriber errors on broadcast, so throwing
      // here would publish a generation with no feed and still report success.
      await harness.installPlugin(blogPlugin());
      await harness
        .getEntityService()
        .createEntity({ entity: sampleDraftPost });
      const testDir = await fs.mkdtemp(join(tmpdir(), "blog-rss-failure-"));
      const failures: string[] = [];
      // A staging directory that is a file cannot take the feed.
      const notADirectory = join(testDir, "not-a-directory");
      await fs.writeFile(notADirectory, "");

      try {
        await harness.sendMessage(
          siteBuildStagingContract.name,
          {
            environment: "preview" as const,
            routesBuilt: 1,
            outputDir: notADirectory,
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
        expect(failures[0]).toContain("post feed generation failed");
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
