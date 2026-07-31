import {
  renderPdf as defaultRenderPdf,
  type PdfRenderOptions,
} from "@brains/media-renderer";
import { captureMediaPage } from "./capture";
import type { MediaPageTemplate } from "./types";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export interface RenderPrintablePdfOptions {
  /** Route the throwaway page is written under, e.g. `/_media/printable/post/<id>`. */
  mediaPath: string;
  template: MediaPageTemplate;
  content: unknown;
  /** Used as the rendered page's title. */
  title: string;
  themeMode?: "light" | "dark" | undefined;
  themeCSS: string;
  /** Prefix for the temp output dir, e.g. `brain-post-printable-`. */
  tmpPrefix: string;
  /** Override the pdf renderer; defaults to the headless renderer. */
  renderPdf?: RenderPdf | undefined;
}

/**
 * Render a template's `pdf` variant to a PDF by writing a throwaway static
 * page, serving it, and printing it headless. Backgrounds and the template's
 * own `@page` sizing are preserved so print stylesheets stay authoritative.
 */
export async function renderPrintablePdf(
  options: RenderPrintablePdfOptions,
): Promise<Buffer> {
  const render = options.renderPdf ?? defaultRenderPdf;

  return captureMediaPage(
    {
      mediaPath: options.mediaPath,
      template: options.template,
      format: "pdf",
      content: options.content,
      title: options.title,
      themeMode: options.themeMode,
      themeCSS: options.themeCSS,
      tmpPrefix: options.tmpPrefix,
    },
    (url) =>
      render(url, {
        maxBytes: DEFAULT_MAX_BYTES,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        printBackground: true,
        preferCSSPageSize: true,
      }),
  );
}
