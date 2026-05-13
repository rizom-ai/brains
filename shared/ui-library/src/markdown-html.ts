import { Marked } from "marked";

/**
 * Custom image renderer function.
 * Return a string to override the default rendering, or undefined to use the default.
 */
export type ImageRenderer = (
  href: string,
  title: string | null,
  text: string,
) => string | undefined;

export interface MarkdownToHtmlOptions {
  /** Custom image renderer for optimized/responsive images */
  imageRenderer?: ImageRenderer;
}

/**
 * Convert markdown to HTML.
 * Uses marked for conversion with sensible defaults.
 */
const defaultMarked = new Marked({ gfm: true, breaks: true });
const rendererCache = new WeakMap<ImageRenderer, Marked>();

function getMarkedInstance(imageRenderer?: ImageRenderer): Marked {
  if (!imageRenderer) return defaultMarked;

  let instance = rendererCache.get(imageRenderer);
  if (!instance) {
    instance = new Marked({ gfm: true, breaks: true });
    instance.use({
      renderer: {
        image(
          href: string,
          title: string | null,
          text: string,
        ): string | false {
          return imageRenderer(href, title, text) ?? false;
        },
      },
    });
    rendererCache.set(imageRenderer, instance);
  }
  return instance;
}

export function markdownToHtml(
  markdown: string,
  options?: MarkdownToHtmlOptions,
): string {
  const instance = getMarkedInstance(options?.imageRenderer);

  let html = instance.parse(markdown) as string;

  // Post-process: wrap attribution lines after blockquotes in <cite>
  // Matches </blockquote> followed by <p> starting with emdash (—) or double hyphen (--)
  // Captures the emdash and the rest of the paragraph content until </p>
  // Uses [\s\S]*? to match any content including HTML tags (like <a>)
  html = html.replace(
    /<\/blockquote>\s*<p>(—|--|–)([\s\S]*?)<\/p>/g,
    '</blockquote>\n<cite class="block-attribution"><span class="emdash">$1</span>$2</cite>',
  );

  return html;
}
