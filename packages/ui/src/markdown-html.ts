import { Marked, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";
import type { ImageRenderer } from "@brains/contracts";

export type { ImageRenderer, RenderedImageRef } from "@brains/contracts";

export interface MarkdownToHtmlOptions {
  imageRenderer?: ImageRenderer;
}

const defaultMarked = new Marked({ gfm: true, breaks: true });

/**
 * Allowlist tuned for marked's GFM output plus our `<cite class="...">` /
 * `<span class="emdash">` blockquote-attribution post-processing.
 *
 * Sanitization matters here because `markdownToHtml` output is rendered into
 * a real browser in privileged contexts (Bun WebView PDF capture against a
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
    // instead of being silently dropped. `data:` is intentionally excluded —
    // SVG payloads (`data:image/svg+xml`) can execute scripts in Chromium
    // during PDF capture.
    img: ["http", "https", "entity"],
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
          // Adapt marked's AST shape to the renderer-neutral contract here,
          // at the boundary that owns the marked dependency.
          image({ href, title, text }: Tokens.Image): string | false {
            return (
              imageRenderer({
                href,
                alt: text,
                ...(title !== null ? { title } : {}),
              }) ?? false
            );
          },
        },
      })
    : defaultMarked;

  // See renderer.ts: marked's declared string | Promise<string> reflects async
  // extension support this call does not enable. Fail rather than emit
  // "[object Promise]" into rendered HTML.
  const parsed = instance.parse(markdown);
  if (typeof parsed !== "string") {
    throw new Error("Markdown renderer received an async marked result");
  }
  let html = parsed;

  // Wrap attribution lines after blockquotes in <cite> for styling.
  html = html.replace(
    /<\/blockquote>\s*<p>(—|--|–)([\s\S]*?)<\/p>/g,
    '</blockquote>\n<cite class="block-attribution"><span class="emdash">$1</span>$2</cite>',
  );

  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
