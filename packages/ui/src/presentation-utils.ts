export interface SlideDirectiveResult {
  attributes: Record<string, string>;
  markdown: string;
}

const SLIDE_DIRECTIVE_PATTERN = /<!--\s*\.slide:\s*(.*?)\s*-->/g;

/**
 * Parse Reveal.js-compatible slide directives from a markdown chunk.
 * Extracts `<!-- .slide: key="value" ... -->` comments, returning the
 * attributes plus the cleaned markdown. Supports quoted values and
 * bare boolean attributes.
 */
export function parseSlideDirectives(markdown: string): SlideDirectiveResult {
  const attributes: Record<string, string> = {};

  for (const match of markdown.matchAll(SLIDE_DIRECTIVE_PATTERN)) {
    const attrString = match[1] ?? "";

    for (const attrMatch of attrString.matchAll(
      /([\w-]+)=["']([^"']*?)["']/g,
    )) {
      const key = attrMatch[1];
      const value = attrMatch[2];
      if (key && value !== undefined) {
        attributes[key] = value;
      }
    }

    // Strip quoted attrs before matching bare words so a key from
    // `key="value bare"` isn't picked up as a boolean attribute.
    const withoutQuoted = attrString
      .replace(/([\w-]+)=["']([^"']*?)["']/g, "")
      .trim();
    if (withoutQuoted) {
      for (const boolMatch of withoutQuoted.matchAll(
        /(?:^|\s)([\w-]+)(?=\s|$)/g,
      )) {
        const key = boolMatch[1];
        if (key) {
          attributes[key] = "true";
        }
      }
    }
  }

  const cleaned = markdown
    .replace(SLIDE_DIRECTIVE_PATTERN, "")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { attributes, markdown: cleaned };
}

const BREAK_PATTERN = /<!--\s*\.break\s*-->/;

export function splitColumns(markdown: string): string[] | null {
  const parts = markdown.split(BREAK_PATTERN);
  return parts.length > 1 ? parts : null;
}
