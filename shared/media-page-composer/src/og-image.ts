import {
  screenshotPng as defaultScreenshotPng,
  type ScreenshotPngOptions,
  type ViewportOptions,
} from "@brains/media-renderer";
import { captureMediaPage } from "./capture";
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
 * serving it, and screenshotting it headless.
 */
export async function renderOgImagePng(
  options: RenderOgImagePngOptions,
): Promise<Buffer> {
  const screenshot = options.screenshotPng ?? defaultScreenshotPng;

  return captureMediaPage(
    {
      mediaPath: options.mediaPath,
      template: options.template,
      format: "image",
      content: options.content,
      title: options.title,
      themeMode: options.themeMode,
      themeCSS: options.themeCSS,
      tmpPrefix: options.tmpPrefix,
    },
    (url) =>
      screenshot(url, OG_VIEWPORT, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        fullPage: false,
        omitBackground: false,
      }),
  );
}
