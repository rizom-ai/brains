/**
 * Result of parsing slide directives from a markdown chunk.
 */
export interface SlideDirectiveResult {
  /** Key-value attributes extracted from <!-- .slide: ... --> */
  attributes: Record<string, string>;
  /** Markdown with directive comments stripped */
  markdown: string;
}

/** Matches <!-- .slide: ... --> directives */
const SLIDE_DIRECTIVE_PATTERN = /<!--\s*\.slide:\s*(.*?)\s*-->/g;

/**
 * Parse Reveal.js-compatible slide directives from a markdown chunk.
 *
 * Extracts `<!-- .slide: key="value" ... -->` comments and returns
 * the attributes as a record plus the cleaned markdown.
 *
 * Supports:
 * - Quoted values: `data-background-color="#ff0000"`
 * - Boolean attributes: `data-auto-animate`
 * - Multiple attributes per directive
 */
export function parseSlideDirectives(markdown: string): SlideDirectiveResult {
  const attributes: Record<string, string> = {};

  // Collect attributes from all directive comments
  for (const match of markdown.matchAll(SLIDE_DIRECTIVE_PATTERN)) {
    const attrString = match[1] ?? "";

    // Extract quoted key="value" pairs
    for (const attrMatch of attrString.matchAll(
      /([\w-]+)=["']([^"']*?)["']/g,
    )) {
      const key = attrMatch[1];
      const value = attrMatch[2];
      if (key && value !== undefined) {
        attributes[key] = value;
      }
    }

    // Extract boolean attributes — strip quoted attrs first, then match bare words
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

  // Strip all directive comments in a single pass, then clean up whitespace
  const cleaned = markdown
    .replace(SLIDE_DIRECTIVE_PATTERN, "")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { attributes, markdown: cleaned };
}

/** Matches <!-- .break --> column separator */
const BREAK_PATTERN = /<!--\s*\.break\s*-->/;

/**
 * Split markdown content on `<!-- .break -->` separators.
 *
 * Returns an array of column strings, or null if no break is found.
 * Each column's content is preserved as-is (not trimmed).
 */
export function splitColumns(markdown: string): string[] | null {
  const parts = markdown.split(BREAK_PATTERN);
  return parts.length > 1 ? parts : null;
}
