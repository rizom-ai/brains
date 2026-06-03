import { describe, expect, it } from "bun:test";
import { readdir } from "fs/promises";
import { tmpdir } from "os";
import { h, type JSX } from "preact";
import { z } from "@brains/utils";
import { renderOgImagePng, type MediaPageTemplate } from "../src";

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function OgCard(props: Record<string, unknown>): JSX.Element {
  return h("div", { className: "og-card" }, String(props["title"]));
}

function createTemplate(): MediaPageTemplate {
  return {
    name: "og-template",
    pluginId: "test",
    schema: z.object({ title: z.string() }),
    renderers: { image: OgCard },
  };
}

async function countTempDirs(prefix: string): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((entry) => entry.startsWith(prefix)).length;
}

describe("renderOgImagePng", () => {
  it("renders a template to a PNG through the injected screenshot fn", async () => {
    let capturedUrl = "";
    let capturedViewport: { width: number; height: number } | undefined;
    let renderedHtml = "";

    const png = await renderOgImagePng({
      mediaPath: "/_media/og/project/project-1",
      template: createTemplate(),
      content: { title: "Civic Signals" },
      title: "Civic Signals",
      themeMode: "light",
      themeCSS: "",
      tmpPrefix: "og-image-render-",
      screenshotPng: async (url, viewport) => {
        capturedUrl = url;
        capturedViewport = viewport;
        renderedHtml = await (await fetch(url)).text();
        return TINY_PNG;
      },
    });

    expect(png).toEqual(TINY_PNG);
    expect(capturedUrl).toContain("/_media/og/project/project-1/");
    // Open Graph images are a fixed 1200×630.
    expect(capturedViewport).toEqual({ width: 1200, height: 630 });
    expect(renderedHtml).toContain("Civic Signals");
  });

  it("removes its temp directory after rendering", async () => {
    const prefix = "og-image-cleanup-";
    const before = await countTempDirs(prefix);

    await renderOgImagePng({
      mediaPath: "/_media/og/project/project-1",
      template: createTemplate(),
      content: { title: "Civic Signals" },
      title: "Civic Signals",
      themeCSS: "",
      tmpPrefix: prefix,
      screenshotPng: async () => TINY_PNG,
    });

    expect(await countTempDirs(prefix)).toBe(before);
  });

  it("cleans up its temp directory even when the screenshot fails", async () => {
    const prefix = "og-image-fail-";
    const before = await countTempDirs(prefix);

    let error: unknown;
    try {
      await renderOgImagePng({
        mediaPath: "/_media/og/project/project-1",
        template: createTemplate(),
        content: { title: "Civic Signals" },
        title: "Civic Signals",
        themeCSS: "",
        tmpPrefix: prefix,
        screenshotPng: async () => {
          throw new Error("screenshot boom");
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("screenshot boom");
    expect(await countTempDirs(prefix)).toBe(before);
  });
});
