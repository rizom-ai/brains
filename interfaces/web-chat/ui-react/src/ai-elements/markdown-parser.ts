export type MarkdownSegment =
  | { type: "code"; code: string; language: string | undefined }
  | { type: "text"; text: string };

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

const SAFE_LINK_SCHEMES = ["http://", "https://", "mailto:"];

export function isSafeLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  const lower = trimmed.toLowerCase();
  return SAFE_LINK_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

export function parseMarkdownSegments(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(markdown)) !== null) {
    if (match.index > cursor) {
      segments.push({
        type: "text",
        text: markdown.slice(cursor, match.index),
      });
    }
    const language = match[1]?.trim();
    segments.push({
      type: "code",
      language: language && language.length > 0 ? language : undefined,
      code: match[2] ?? "",
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < markdown.length) {
    segments.push({ type: "text", text: markdown.slice(cursor) });
  }

  return segments;
}

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  let buffer = "";

  const flushBuffer = (): void => {
    if (buffer.length > 0) {
      nodes.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  while (cursor < input.length) {
    const remaining = input.slice(cursor);

    const linkMatch = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(remaining);
    if (linkMatch) {
      const [whole, label, href] = linkMatch;
      if (label !== undefined && href !== undefined && isSafeLinkHref(href)) {
        flushBuffer();
        nodes.push({ type: "link", href, children: parseInline(label) });
        cursor += whole.length;
        continue;
      }
    }

    if (remaining.startsWith("**")) {
      const end = remaining.indexOf("**", 2);
      if (end > 2) {
        flushBuffer();
        nodes.push({
          type: "bold",
          children: parseInline(remaining.slice(2, end)),
        });
        cursor += end + 2;
        continue;
      }
    }

    const ch = remaining[0];
    if ((ch === "*" || ch === "_") && remaining[1] !== ch) {
      const end = remaining.indexOf(ch, 1);
      if (end > 1) {
        flushBuffer();
        nodes.push({
          type: "italic",
          children: parseInline(remaining.slice(1, end)),
        });
        cursor += end + 1;
        continue;
      }
    }

    if (ch === "`") {
      const end = remaining.indexOf("`", 1);
      if (end > 1) {
        flushBuffer();
        nodes.push({ type: "code", text: remaining.slice(1, end) });
        cursor += end + 1;
        continue;
      }
    }

    buffer += ch;
    cursor += 1;
  }

  flushBuffer();
  return nodes;
}
