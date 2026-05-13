import { Marked } from "marked";

export type ImageRenderer = (
  href: string,
  title: string | null,
  text: string,
) => string | undefined;

export interface MarkdownToHtmlOptions {
  imageRenderer?: ImageRenderer;
}

const defaultMarked = new Marked({ gfm: true, breaks: true });

export function markdownToHtml(
  markdown: string,
  options?: MarkdownToHtmlOptions,
): string {
  const { imageRenderer } = options ?? {};
  const instance = imageRenderer
    ? new Marked({ gfm: true, breaks: true }).use({
        renderer: {
          image(
            href: string,
            title: string | null,
            text: string,
          ): string | false {
            return imageRenderer(href, title, text) ?? false;
          },
        },
      })
    : defaultMarked;

  let html = instance.parse(markdown) as string;

  // Wrap attribution lines after blockquotes in <cite> for styling.
  html = html.replace(
    /<\/blockquote>\s*<p>(—|--|–)([\s\S]*?)<\/p>/g,
    '</blockquote>\n<cite class="block-attribution"><span class="emdash">$1</span>$2</cite>',
  );

  return html;
}
