/**
 * Inlined rather than imported from `@brains/utils`, which is a private
 * workspace this published package must not depend on.
 */
function escapeHtmlString(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(String.fromCharCode(34), "&quot;")
    .replaceAll(String.fromCharCode(39), "&#39;");
}

const MERMAID_BLOCK_PATTERN =
  /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39);/g;

export function escapeHtml(value: unknown): string {
  return escapeHtmlString(String(value));
}

function unescapeHtml(text: string): string {
  return text.replace(ENTITY_PATTERN, (match) => HTML_ENTITIES[match] ?? match);
}

/**
 * Mermaid.js parses diagram syntax from `<div class="mermaid">`, not from
 * highlighted code blocks — so rewrite the fence and unescape entities.
 */
export function convertMermaidBlocks(html: string): string {
  return html.replace(MERMAID_BLOCK_PATTERN, (_match, content: string) => {
    return `<div class="mermaid">${unescapeHtml(content)}</div>`;
  });
}
