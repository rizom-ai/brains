import { afterEach, beforeEach, expect, test } from "bun:test";
import { EntityUrlGenerator, FeedRegistry } from "@brains/site-composition";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { writeSiteBuildFeeds } from "../../src/lib/feed-file-handler";

beforeEach(() => {
  FeedRegistry.resetInstance();
});
afterEach(() => {
  FeedRegistry.resetInstance();
});

test.each(["essays", "default"])(
  "RSS uses the site's %s route and keeps the production publication filter",
  async (route) => {
    const directory = await createTestDirectory("feed-route");
    try {
      const shell = createMockShell();
      shell.addEntities(
        ["published", "draft"].map((status) => ({
          id: status,
          entityType: "post",
          content: "Body",
          contentHash: status,
          visibility: "public",
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
          metadata: { status },
        })),
      );
      FeedRegistry.getInstance().register({
        entityType: "post",
        path: "feed.xml",
        routePrefix: "posts",
        toItem: (entity) => ({
          title: "Post",
          slug: entity.id,
          content: entity.content,
          description: "Excerpt",
          author: "Author",
          publishedAt: entity.created,
        }),
      });
      const urls = new EntityUrlGenerator(
        route === "default"
          ? undefined
          : { post: { label: "Essay", pluralName: route } },
      );
      await writeSiteBuildFeeds({
        outputDir: directory.dir,
        entityService: shell.getEntityService(),
        environment: "production",
        siteTitle: "Site",
        siteDescription: "Description",
        siteUrl: "https://example.test/",
        generateEntityUrl: (type, slug) => urls.generateUrl(type, slug),
        logger: createSilentLogger(),
        signal: new AbortController().signal,
      });
      const xml = await Bun.file(`${directory.dir}/feed.xml`).text();
      const expected = `https://example.test/${route === "default" ? "posts" : route}/published`;
      expect(xml).toContain(`<link>${expected}</link>`);
      expect(xml).toContain(`<guid isPermaLink="true">${expected}</guid>`);
      expect(xml).not.toContain("/draft");
    } finally {
      await directory.cleanup();
    }
  },
);
