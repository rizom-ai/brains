import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { h, type JSX } from "preact";
import { z } from "@brains/utils";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "../../src/lib/media-render-page";

const tempDirs: string[] = [];

function PdfComponent(props: Record<string, unknown>): JSX.Element {
  return h("article", { className: "carousel-slide" }, String(props["title"]));
}

function createTemplate(): SiteViewTemplate {
  return {
    name: "carousel-template",
    pluginId: "test",
    schema: z.object({ title: z.string() }),
    renderers: {
      pdf: PdfComponent,
    },
  };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "media-render-page-"));
  tempDirs.push(dir);
  return dir;
}

function expectErrorMessage(error: unknown, message: string): void {
  if (!(error instanceof Error)) {
    throw new Error("Expected an Error to be thrown");
  }
  expect(error.message).toContain(message);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("writeMediaRenderPage", () => {
  it("writes a rendered media template under _media and returns its URL path", async () => {
    const outputDir = await createTempDir();

    const result = await writeMediaRenderPage({
      outputDir,
      mediaPath: "/_media/carousel/template/post-1",
      template: createTemplate(),
      format: "pdf",
      content: { title: "Carousel" },
      siteConfig: { title: "Test Site", themeMode: "dark" },
    });

    expect(result.urlPath).toBe("/_media/carousel/template/post-1/");
    expect(result.filePath).toBe(
      join(outputDir, "_media", "carousel", "template", "post-1", "index.html"),
    );

    const html = await readFile(result.filePath, "utf-8");
    expect(html).toContain("Carousel");
    expect(html).toContain('class="carousel-slide"');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('<link rel="stylesheet" href="/styles/main.css">');
  });

  it("rejects paths outside the internal media namespace", async () => {
    const outputDir = await createTempDir();

    let error: unknown;
    try {
      await writeMediaRenderPage({
        outputDir,
        mediaPath: "/posts/not-media",
        template: createTemplate(),
        format: "pdf",
        content: { title: "Carousel" },
        siteConfig: { title: "Test Site" },
      });
    } catch (caught) {
      error = caught;
    }

    expectErrorMessage(error, "Media render paths must start with /_media/");
  });

  it("rejects traversal attempts", async () => {
    const outputDir = await createTempDir();

    let error: unknown;
    try {
      await writeMediaRenderPage({
        outputDir,
        mediaPath: "/_media/../outside",
        template: createTemplate(),
        format: "pdf",
        content: { title: "Carousel" },
        siteConfig: { title: "Test Site" },
      });
    } catch (caught) {
      error = caught;
    }

    expectErrorMessage(error, "Media render path cannot contain traversal");
  });
});

describe("startStaticRenderServer", () => {
  it("serves generated media pages and shared CSS from the build output", async () => {
    const outputDir = await createTempDir();
    await mkdir(join(outputDir, "styles"), { recursive: true });
    await writeFile(
      join(outputDir, "styles", "main.css"),
      ".carousel-slide { color: red; }",
      "utf-8",
    );

    const page = await writeMediaRenderPage({
      outputDir,
      mediaPath: "/_media/carousel/template/post-1",
      template: createTemplate(),
      format: "pdf",
      content: { title: "Carousel" },
      siteConfig: { title: "Test Site" },
    });

    const server = await startStaticRenderServer({ rootDir: outputDir });
    try {
      const pageResponse = await fetch(server.urlFor(page.urlPath));
      const cssResponse = await fetch(server.urlFor("/styles/main.css"));

      expect(pageResponse.status).toBe(200);
      expect(await pageResponse.text()).toContain("Carousel");
      expect(cssResponse.status).toBe(200);
      expect(await cssResponse.text()).toBe(".carousel-slide { color: red; }");
    } finally {
      await server.close();
    }
  });

  it("does not serve files outside the configured root", async () => {
    const outputDir = await createTempDir();
    const server = await startStaticRenderServer({ rootDir: outputDir });

    try {
      const response = await fetch(
        server.urlFor("/_media/%2e%2e/%2e%2e/etc/passwd"),
      );

      expect(response.status).not.toBe(200);
    } finally {
      await server.close();
    }
  });
});
