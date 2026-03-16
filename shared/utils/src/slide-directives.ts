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

/** Matches key="value" or key='value' pairs */
const ATTR_QUOTED_PATTERN = /([\w-]+)=["']([^"']*?)["']/g;

/** Matches standalone boolean attributes (no =) */
const ATTR_BOOLEAN_PATTERN = /(?:^|\s)([\w-]+)(?=\s|$)/g;

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
  let cleaned = markdown;

  // Find all slide directive comments
  const matches = [...markdown.matchAll(SLIDE_DIRECTIVE_PATTERN)];

  for (const match of matches) {
    const attrString = match[1] ?? "";

    // Extract quoted key="value" pairs
    for (const attrMatch of attrString.matchAll(ATTR_QUOTED_PATTERN)) {
      const key = attrMatch[1];
      const value = attrMatch[2];
      if (key && value !== undefined) {
        attributes[key] = value;
      }
    }

    // Extract boolean attributes (words not followed by =)
    // Remove already-matched quoted attrs first
    const withoutQuoted = attrString.replace(ATTR_QUOTED_PATTERN, "").trim();
    if (withoutQuoted) {
      for (const boolMatch of withoutQuoted.matchAll(ATTR_BOOLEAN_PATTERN)) {
        const key = boolMatch[1];
        if (key) {
          attributes[key] = "true";
        }
      }
    }

    // Remove the directive comment from markdown
    const fullMatch = match[0];
    cleaned = cleaned.replace(fullMatch, "");
  }

  // Clean up: remove blank lines left by directive removal
  cleaned = cleaned
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
  if (!BREAK_PATTERN.test(markdown)) {
    return null;
  }

  return markdown.split(/<!--\s*\.break\s*-->/);
}
