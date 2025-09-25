import type { EntityAdapter } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { summarySchema } from "../schemas/summary";
import type {
  SummaryEntity,
  SummaryBody,
  SummaryLogEntry,
} from "../schemas/summary";
import type { z } from "@brains/utils";

/**
 * Adapter for summary entities with simplified log-based structure
 * Entries are prepended (newest first) for optimization
 */
export class SummaryAdapter implements EntityAdapter<SummaryEntity> {
  public readonly entityType = "summary";
  public readonly schema = summarySchema;

  /**
   * Format a single log entry to markdown
   */
  private formatEntry(entry: SummaryLogEntry): string {
    const header =
      entry.created === entry.updated
        ? `### [${entry.created}] ${entry.title}`
        : `### [${entry.created} - Updated ${entry.updated}] ${entry.title}`;

    return `${header}\n\n${entry.content}\n\n---\n`;
  }

  /**
   * Create markdown content from summary body
   * Entries are in reverse chronological order (newest first)
   */
  public createSummaryContent(body: SummaryBody): string {
    const lines: string[] = [];

    // Main title
    lines.push(`# Conversation Summary: ${body.conversationId}`);
    lines.push("");
    lines.push("## Metadata");
    lines.push("");
    lines.push(`**Total Messages:** ${body.totalMessages}`);
    lines.push(`**Last Updated:** ${body.lastUpdated}`);
    lines.push("");
    lines.push("## Summary Log");
    lines.push("");

    // Add each log entry (already in newest-first order)
    for (const entry of body.entries) {
      lines.push(this.formatEntry(entry));
    }

    return lines.join("\n");
  }

  /**
   * Parse a single entry from markdown section
   */
  private parseEntry(section: string): SummaryLogEntry {
    const lines = section.split("\n");
    const headerLine = lines[0] ?? "";

    // Extract timestamp and title from header
    const match = headerLine.match(/\[(.*?)\] (.*)$/);
    if (!match) {
      return {
        title: "",
        content: section.trim(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
    }

    const [, timestamp = "", title = ""] = match;

    // Check for update timestamp
    let created = timestamp;
    let updated = timestamp;
    if (timestamp.includes(" - Updated ")) {
      const parts = timestamp.split(" - Updated ");
      created = parts[0] ?? timestamp;
      updated = parts[1] ?? timestamp;
    }

    // Extract content (everything after header until ---)
    const content = lines
      .slice(1)
      .join("\n")
      .replace(/\n---\s*$/, "")
      .trim();

    return {
      title,
      content,
      created,
      updated,
    };
  }

  /**
   * Parse summary body from markdown content
   */
  public parseSummaryContent(content: string): SummaryBody {
    const entries: SummaryLogEntry[] = [];

    // Extract conversation ID from title
    const titleMatch = content.match(/^# Conversation Summary: (.+)$/m);
    const conversationId = titleMatch?.[1] ?? "";

    // Extract metadata
    const totalMessagesMatch = content.match(/\*\*Total Messages:\*\* (\d+)/);
    const totalMessages = totalMessagesMatch?.[1]
      ? parseInt(totalMessagesMatch[1], 10)
      : 0;

    const lastUpdatedMatch = content.match(/\*\*Last Updated:\*\* (.+)/);
    const lastUpdated = lastUpdatedMatch?.[1] ?? new Date().toISOString();

    // Split by entry headers (### [...])
    const logSection = content.split("## Summary Log")[1];
    if (!logSection) {
      return {
        conversationId,
        entries: [],
        totalMessages: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    // Split by ### but keep the delimiter
    const entrySections = logSection.split(/^###\s+/m).slice(1); // Skip content before first entry

    for (const section of entrySections) {
      // Add back the header start for parsing
      const entry = this.parseEntry(section);
      if (entry.title) {
        entries.push(entry);
      }
    }

    return {
      conversationId,
      entries, // Already in newest-first order from the markdown
      totalMessages,
      lastUpdated,
    };
  }

  /**
   * Get the first N entries (most recent) from content
   */
  public getRecentEntries(content: string, count: number): SummaryLogEntry[] {
    const body = this.parseSummaryContent(content);
    return body.entries.slice(0, count);
  }

  /**
   * Convert entity to markdown
   */
  public toMarkdown(entity: SummaryEntity): string {
    return entity.content;
  }

  /**
   * Create entity from markdown
   */
  public fromMarkdown(markdown: string): Partial<SummaryEntity> {
    const body = this.parseSummaryContent(markdown);

    // Get the oldest entry's created date (last in array since they're newest-first)
    // If entries are empty, use current date
    const oldestEntry = body.entries[body.entries.length - 1];
    const newestEntry = body.entries[0];

    return {
      entityType: "summary",
      content: markdown,
      created: oldestEntry?.created ?? new Date().toISOString(),
      updated: newestEntry?.updated ?? body.lastUpdated,
      metadata: {
        conversationId: body.conversationId,
        channelName: "Unknown", // Default value when parsing from markdown
        entryCount: body.entries.length,
        totalMessages: body.totalMessages,
        lastUpdated: body.lastUpdated,
      },
    };
  }

  /**
   * Extract metadata for storage
   */
  public extractMetadata(entity: SummaryEntity): Record<string, unknown> {
    return entity.metadata;
  }

  /**
   * Parse frontmatter from markdown
   * Summaries don't use frontmatter, everything is in the content
   */
  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for the entity
   * Summaries don't use frontmatter
   */
  public generateFrontMatter(_entity: SummaryEntity): string {
    return "";
  }

  /**
   * Helper to prepend or update an entry in a summary
   * @param existingContent - Existing summary markdown or null
   * @param newEntry - The new entry to add or update with
   * @param conversationId - The conversation ID
   * @param shouldUpdate - Whether to update an existing entry
   * @param entryIndexToUpdate - Index of entry to update (0 = most recent)
   */
  public addOrUpdateEntry(
    existingContent: string | null,
    newEntry: SummaryLogEntry,
    conversationId: string,
    shouldUpdate: boolean,
    entryIndexToUpdate?: number,
  ): string {
    let body: SummaryBody;

    if (!existingContent) {
      // Create new summary with first entry
      body = {
        conversationId,
        entries: [newEntry],
        totalMessages: 0, // Will be updated by caller
        lastUpdated: newEntry.created,
      };
    } else {
      // Parse existing and add/update entry
      body = this.parseSummaryContent(existingContent);

      if (
        shouldUpdate &&
        entryIndexToUpdate !== undefined &&
        body.entries[entryIndexToUpdate]
      ) {
        // Update existing entry (merge the content)
        const existingEntry = body.entries[entryIndexToUpdate];
        body.entries[entryIndexToUpdate] = {
          ...existingEntry,
          content: `${existingEntry.content}\n\nUPDATE: ${newEntry.content}`,
          updated: newEntry.created, // Set updated timestamp
        };
      } else {
        // Prepend new entry (newest first)
        body.entries.unshift(newEntry);
      }

      body.lastUpdated = newEntry.created;
    }

    return this.createSummaryContent(body);
  }
}
