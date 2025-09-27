/**
 * Reusable formatters for common entity field types
 */

/**
 * Source reference with metadata
 */
export interface SourceReference {
  id: string;
  title: string;
  type: "conversation" | "file" | "manual";
}

/**
 * Formatter for source lists in entity markdown
 * Formats sources as "Title (id)" for human readability
 */
export const SourceListFormatter = {
  /**
   * Format source objects to markdown list
   */
  format(sources: SourceReference[]): string {
    if (sources.length === 0) {
      return "";
    }
    return sources.map((s) => `- ${s.title} (${s.id})`).join("\n");
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

    return lines.map((line) => {
      // Try to parse "- Title (id)" format
      const match = line.match(/^- (.+) \(([^)]+)\)$/);
      if (match?.[1] && match[2]) {
        return {
          id: match[2].trim(),
          title: match[1].trim(),
          type: "conversation" as const,
        };
      }

      // Fallback for plain "- id" format (backward compatibility)
      const id = line.slice(2).trim();
      return {
        id,
        title: id, // Use ID as title for old format
        type: "conversation" as const,
      };
    });
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
