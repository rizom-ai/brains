import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

export type ImageRenderer = (
  href: string,
  title: string | null,
  text: string,
) => string | undefined;

export interface MarkdownToHtmlOptions {
  imageRenderer?: ImageRenderer;
}

const defaultMarked = new Marked({ gfm: true, breaks: true });

/**
 * Allowlist tuned for marked's GFM output plus our `<cite class="...">` /
 * `<span class="emdash">` blockquote-attribution post-processing.
 *
 * Sanitization matters here because `markdownToHtml` output is rendered into
 * a real browser in privileged contexts (Playwright PDF capture against a
 * localhost render server) — a `<script>` smuggled through markdown would
 * execute during render and could issue outbound fetches before the
 * snapshot completes.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "ul",
    "ol",
    "li",
    "blockquote",
    "cite",
    "code",
    "pre",
    "em",
    "strong",
    "del",
    "ins",
    "sub",
    "sup",
    "a",
    "img",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "div",
  ],
  allowedAttributes: {
    a: ["href", "title", "name"],
    img: [
      "src",
      "srcset",
      "sizes",
      "alt",
      "title",
      "width",
      "height",
      "class",
      "loading",
      "decoding",
    ],
    code: ["class"],
    pre: ["class"],
    span: ["class"],
    cite: ["class"],
    div: ["class"],
    th: ["align", "colspan", "rowspan", "scope"],
    td: ["align", "colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    // `entity:` is the project-internal scheme for unresolved image refs;
    // the image renderer normally rewrites these to http(s) before sanitize
    // runs, but unresolved refs need to survive so they show up visibly
    // instead of being silently dropped.
    img: ["http", "https", "data", "entity"],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

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

  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
