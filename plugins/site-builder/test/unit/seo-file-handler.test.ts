import { describe, expect, it } from "bun:test";
import type { PreparedSiteBuild } from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeSiteBuildSeoFiles } from "../../src/lib/seo-file-handler";

function createPreparedBuild(): PreparedSiteBuild {
  return {
    buildId: "seo-build",
    preparedAt: "2026-07-22T00:00:00.000Z",
    environment: "production",
    site: {
      title: "SEO Site",
      description: "SEO fixture",
      copyright: "SEO copyright",
      navigation: { primary: [], secondary: [] },
    },
    routes: [
      {
        id: "home",
        path: "/",
        title: "Home",
        description: "Home route",
        layout: "default",
        fullscreen: false,
        sections: [],
        headScripts: [],
      },
    ],
    images: {},
    staticAssets: {},
    publicAssets: {},
    globalHeadScripts: [],
  };
}

describe("writeSiteBuildSeoFiles", () => {
  it("writes robots.txt and sitemap.xml inside the staging output dir", async () => {
    const outputDir = await fs.mkdtemp(join(tmpdir(), "seo-handler-"));
    try {
      await writeSiteBuildSeoFiles({
        outputDir,
        preparedBuild: createPreparedBuild(),
        logger: createSilentLogger(),
        siteUrl: "https://example.com",
        signal: new AbortController().signal,
      });

      const robots = await fs.readFile(join(outputDir, "robots.txt"), "utf8");
      const sitemap = await fs.readFile(join(outputDir, "sitemap.xml"), "utf8");
      expect(robots.length).toBeGreaterThan(0);
      expect(sitemap).toContain("https://example.com");
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
