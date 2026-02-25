import { BaseEntityAdapter } from "@brains/plugins";
import { summarySchema, summaryMetadataSchema } from "../schemas/summary";
import type {
  SummaryEntity,
  SummaryLogEntry,
  SummaryMetadata,
} from "../schemas/summary";

/**
 * Adapter for summary entities with simplified log-based structure
 * Entries are prepended (newest first) for optimization
 */
export class SummaryAdapter extends BaseEntityAdapter<
  SummaryEntity,
  SummaryMetadata
> {
  constructor() {
    super({
      entityType: "summary",
      schema: summarySchema,
      frontmatterSchema: summaryMetadataSchema,
    });
  }

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
   * Create markdown content body (without frontmatter)
   * Only includes the summary log entries, metadata goes in frontmatter
   */
  public createContentBody(entries: SummaryLogEntry[]): string {
    const lines: string[] = [];

    lines.push("# Summary Log");
    lines.push("");

    // Add each log entry (already in newest-first order)
    for (const entry of entries) {
      lines.push(this.formatEntry(entry));
    }

    return lines.join("\n");
  }

  /**
   * Parse entries from content body
   */
  public parseEntriesFromContent(content: string): SummaryLogEntry[] {
    const entries: SummaryLogEntry[] = [];

    // Split by entry headers (### [...])
    const sections = content.split(/^###\s+/m).slice(1); // Skip content before first entry

    for (const section of sections) {
      const entry = this.parseEntry(section);
      if (entry.title) {
        entries.push(entry);
      }
    }

    return entries;
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
   * Get the first N entries (most recent) from content
   */
  public getRecentEntries(content: string, count: number): SummaryLogEntry[] {
    const entries = this.parseEntriesFromContent(content);
    return entries.slice(0, count);
  }

  /**
   * Convert entity to markdown with frontmatter
   */
  public toMarkdown(entity: SummaryEntity): string {
    const contentBody = this.extractBody(entity.content);
    const entries = this.parseEntriesFromContent(contentBody);
    const cleanBody = this.createContentBody(entries);
    return this.buildMarkdown(
      cleanBody,
      entity.metadata as Record<string, unknown>,
    );
  }

  /**
   * Create entity from markdown, extracting metadata from frontmatter
   */
  public fromMarkdown(markdown: string): Partial<SummaryEntity> {
    const metadata = this.parseFrontmatter(markdown);
    const contentBody = this.extractBody(markdown);
    const entries = this.parseEntriesFromContent(contentBody);

    const oldestEntry = entries[entries.length - 1];
    const newestEntry = entries[0];

    return {
      entityType: "summary",
      content: markdown,
      created: oldestEntry?.created ?? new Date().toISOString(),
      updated: newestEntry?.updated ?? new Date().toISOString(),
      metadata: {
        conversationId: metadata.conversationId,
        channelName: metadata.channelName,
        channelId: metadata.channelId,
        interfaceType: metadata.interfaceType,
        entryCount: metadata.entryCount,
        totalMessages: metadata.totalMessages,
      },
    };
  }

  /**
   * Helper to manage summary entries
   * Returns the updated entries list
   */
  public manageEntries(
    existingEntries: SummaryLogEntry[],
    newEntry: SummaryLogEntry,
    shouldUpdate: boolean,
    entryIndexToUpdate?: number,
  ): SummaryLogEntry[] {
    const entries = [...existingEntries];

    if (
      shouldUpdate &&
      entryIndexToUpdate !== undefined &&
      entries[entryIndexToUpdate]
    ) {
      // Update existing entry (merge the content)
      const existingEntry = entries[entryIndexToUpdate];
      entries[entryIndexToUpdate] = {
        ...existingEntry,
        content: `${existingEntry.content}\n\nUPDATE: ${newEntry.content}`,
        updated: newEntry.created, // Set updated timestamp
      };
    } else {
      // Prepend new entry (newest first)
      entries.unshift(newEntry);
    }

    return entries;
  }
}
