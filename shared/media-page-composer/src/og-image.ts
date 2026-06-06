import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  screenshotPng as defaultScreenshotPng,
  type ScreenshotPngOptions,
  type ViewportOptions,
} from "@brains/media-renderer";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "./media-render-page";
import type { MediaPageTemplate } from "./types";

/** Standard Open Graph image dimensions. */
const OG_VIEWPORT: ViewportOptions = { width: 1200, height: 630 };
const DEFAULT_TIMEOUT_MS = 60_000;

export type ScreenshotPng = (
  url: string,
  viewport: ViewportOptions,
  options?: ScreenshotPngOptions,
) => Promise<Buffer>;

export interface RenderOgImagePngOptions {
  /** Route the throwaway page is written under, e.g. `/_media/og/project/<id>`. */
  mediaPath: string;
  template: MediaPageTemplate;
  content: unknown;
  /** Used as the rendered page's title. */
  title: string;
  themeMode?: "light" | "dark" | undefined;
  themeCSS: string;
  /** Prefix for the temp output dir, e.g. `brain-project-og-image-`. */
  tmpPrefix: string;
  /** Override the screenshot function; defaults to the headless renderer. */
  screenshotPng?: ScreenshotPng | undefined;
}

/**
 * Render a template to a 1200×630 PNG by writing a throwaway static page,
 * serving it, and screenshotting it headless. Shared by the per-entity OG
 * image attachment providers so the temp-dir / server / screenshot / cleanup
 * pipeline lives in exactly one place.
 */
export async function renderOgImagePng(
  options: RenderOgImagePngOptions,
): Promise<Buffer> {
  const screenshot = options.screenshotPng ?? defaultScreenshotPng;
  const outputDir = await mkdtemp(join(tmpdir(), options.tmpPrefix));

  try {
    const page = await writeMediaRenderPage({
      outputDir,
      mediaPath: options.mediaPath,
      template: options.template,
      format: "image",
      content: options.content,
      siteConfig: {
        title: options.title,
        themeMode: options.themeMode ?? "light",
      },
      themeCSS: options.themeCSS,
    });

    const server = await startStaticRenderServer({ rootDir: outputDir });
    try {
      return await screenshot(server.urlFor(page.urlPath), OG_VIEWPORT, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        fullPage: false,
        omitBackground: false,
      });
    } finally {
      await server.close();
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}
