/**
 * Reusable formatters for common entity field types
 */

import { z } from "../zod";

/**
 * Source reference schema
 * type can be any entity type (post, link, summary, conversation, etc.)
 */
export const sourceReferenceSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.string(),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;

/**
 * Formatter for source lists in entity markdown
 * Formats sources as "- Title (slug) [type]" for human readability
 */
export const SourceListFormatter = {
  /**
   * Format source objects to markdown list
   */
  format(sources: SourceReference[]): string {
    if (sources.length === 0) {
      return "";
    }
    return sources
      .map((s) => `- ${s.title} (${s.slug}) [${s.type}]`)
      .join("\n");
  },

  /**
   * Parse markdown list back to source objects
   */
  parse(text: string): SourceReference[] {
    if (!text || text.trim() === "") {
      return [];
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));

    return lines
      .map((line) => {
        // Parse "- Title (slug) [type]" format
        const match = line.match(/^- (.+) \(([^)]+)\) \[([^\]]+)\]$/);
        if (match?.[1] && match[2] && match[3]) {
          const parsed = sourceReferenceSchema.safeParse({
            slug: match[2].trim(),
            title: match[1].trim(),
            type: match[3].trim(),
          });
          return parsed.success ? parsed.data : null;
        }
        return null;
      })
      .filter((item): item is SourceReference => item !== null);
  },

  /**
   * Extract sources section from full markdown body
   */
  extractSection(markdown: string): string | null {
    // Match "## Sources" or "### Sources" section
    const match = markdown.match(/^#{2,3}\s+Sources\s*\n+((?:- .+(?:\n|$))+)/m);
    return match?.[1] ? match[1].trim() : null;
  },

  /**
   * Replace sources section in markdown body
   */
  replaceSection(markdown: string, sources: SourceReference[]): string {
    const formatted = this.format(sources);
    const sectionContent = formatted ? `\n${formatted}\n` : "\n_No sources_\n";

    // Try to replace existing Sources section
    const pattern =
      /^(#{2,3}\s+Sources\s*\n+)(?:(?:- .+(?:\n|$))+|_No sources_\n)/m;
    if (pattern.test(markdown)) {
      return markdown.replace(pattern, `$1${sectionContent.trim()}\n`);
    }

    // If no Sources section exists, append it
    return markdown + `\n## Sources\n${sectionContent}`;
  },
};
