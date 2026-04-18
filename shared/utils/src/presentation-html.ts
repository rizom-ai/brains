/** Matches <pre><code class="language-mermaid">...</code></pre> blocks */
const MERMAID_BLOCK_PATTERN =
  /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

/** Common HTML entities that appear in mermaid diagrams */
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39);/g;

/**
 * Escape characters that would otherwise break out of HTML context.
 * Safe to use on any value before interpolating into templated HTML.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Unescape HTML entities back to their original characters.
 */
function unescapeHtml(text: string): string {
  return text.replace(ENTITY_PATTERN, (match) => HTML_ENTITIES[match] ?? match);
}

/**
 * Convert mermaid code blocks in HTML to mermaid divs.
 *
 * Replaces `<pre><code class="language-mermaid">...</code></pre>`
 * with `<div class="mermaid">...</div>`, unescaping HTML entities
 * inside so Mermaid.js can parse the diagram syntax.
 *
 * Non-mermaid code blocks are left unchanged.
 */
export function convertMermaidBlocks(html: string): string {
  return html.replace(MERMAID_BLOCK_PATTERN, (_match, content: string) => {
    return `<div class="mermaid">${unescapeHtml(content)}</div>`;
  });
}
