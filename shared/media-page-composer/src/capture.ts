import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "./media-render-page";
import type { MediaPageTemplate, MediaTemplateFormat } from "./types";

export interface CaptureMediaPageOptions {
  /** Route the throwaway page is written under, e.g. `/_media/og/project/<id>`. */
  mediaPath: string;
  template: MediaPageTemplate;
  /** Renderer variant the template should be rendered with. */
  format: MediaTemplateFormat;
  content: unknown;
  /** Used as the rendered page's title. */
  title: string;
  themeMode?: "light" | "dark" | undefined;
  themeCSS: string;
  /** Prefix for the temp output dir, e.g. `brain-project-og-image-`. */
  tmpPrefix: string;
}

/**
 * Write a throwaway static page, serve it, hand its URL to `capture`, and tear
 * everything down again — including when `capture` throws. Every media
 * primitive (`renderOgImagePng`, `renderPrintablePdf`) differs only in how it
 * captures that URL, so the temp-dir / server / cleanup pipeline lives here
 * alone.
 */
export async function captureMediaPage<T>(
  options: CaptureMediaPageOptions,
  capture: (url: string) => Promise<T>,
): Promise<T> {
  const outputDir = await mkdtemp(join(tmpdir(), options.tmpPrefix));

  try {
    const page = await writeMediaRenderPage({
      outputDir,
      mediaPath: options.mediaPath,
      template: options.template,
      format: options.format,
      content: options.content,
      siteConfig: {
        title: options.title,
        themeMode: options.themeMode ?? "light",
      },
      themeCSS: options.themeCSS,
    });

    const server = await startStaticRenderServer({ rootDir: outputDir });
    try {
      return await capture(server.urlFor(page.urlPath));
    } finally {
      await server.close();
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}
