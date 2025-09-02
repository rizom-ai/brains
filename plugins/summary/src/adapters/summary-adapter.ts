import type { EntityAdapter } from "@brains/plugins";
import { StructuredContentFormatter, parseMarkdownWithFrontmatter } from "@brains/plugins";
import { summarySchema, summaryLogEntrySchema } from "../schemas/summary";
import type {
  SummaryEntity,
  SummaryBody,
  SummaryLogEntry,
} from "../schemas/summary";
import type { z } from "@brains/utils";

/**
 * Adapter for summary entities with log-based structure
 * Entries are prepended (newest first) for easier updates
 */
export class SummaryAdapter implements EntityAdapter<SummaryEntity> {
  public readonly entityType = "summary";
  public readonly schema = summarySchema;

  /**
   * Create a formatter for individual log entries
   */
  private createEntryFormatter(
    title: string,
  ): StructuredContentFormatter<
    Omit<SummaryLogEntry, "title" | "created" | "updated">
  > {
    // We handle title, created, and updated in the wrapper
    // The formatter handles the actual content fields
    const entryWithoutMeta = summaryLogEntrySchema.omit({
      title: true,
      created: true,
      updated: true,
    });

    return new StructuredContentFormatter(entryWithoutMeta, {
      title,
      mappings: [
        {
          key: "content",
          label: "Content",
          type: "string",
        },
        {
          key: "windowStart",
          label: "Window Start",
          type: "number",
        },
        {
          key: "windowEnd",
          label: "Window End",
          type: "number",
        },
        {
          key: "keyPoints",
          label: "Key Points",
          type: "array",
          itemType: "string",
        },
        {
          key: "decisions",
          label: "Decisions",
          type: "array",
          itemType: "string",
        },
        {
          key: "actionItems",
          label: "Action Items",
          type: "array",
          itemType: "string",
        },
        {
          key: "participants",
          label: "Participants",
          type: "array",
          itemType: "string",
        },
      ],
    });
  }

  /**
   * Format a single log entry to markdown
   */
  private formatEntry(entry: SummaryLogEntry): string[] {
    const lines: string[] = [];

    // Timestamp header
    if (entry.created === entry.updated) {
      lines.push(`### [${entry.created}] ${entry.title}`);
    } else {
      lines.push(
        `### [${entry.created} - Updated ${entry.updated}] ${entry.title}`,
      );
    }
    lines.push("");

    // Use formatter for the entry content
    const formatter = this.createEntryFormatter(entry.title);
    const entryData = {
      content: entry.content,
      windowStart: entry.windowStart,
      windowEnd: entry.windowEnd,
      keyPoints: entry.keyPoints,
      decisions: entry.decisions,
      actionItems: entry.actionItems,
      participants: entry.participants,
    };

    // Format the entry but skip the title (first line and blank line)
    const formattedEntry = formatter.format(entryData);
    const entryLines = formattedEntry.split("\n").slice(2); // Skip "# Title" and blank line
    lines.push(...entryLines);

    lines.push("---");
    lines.push("");

    return lines;
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
      lines.push(...this.formatEntry(entry));
    }

    return lines.join("\n");
  }

  /**
   * Parse a single entry from markdown section
   */
  private parseEntry(section: string): SummaryLogEntry | null {
    // Parse header line: [timestamp] title or [timestamp - Updated timestamp] title
    const headerEndIndex = section.indexOf("]");
    if (headerEndIndex === -1) return null;

    const timestampPart = section.substring(0, headerEndIndex);
    const titleLine = section.substring(headerEndIndex + 1).split("\n")[0];
    const title = titleLine?.trim() || "";

    let created: string;
    let updated: string;

    if (timestampPart.includes(" - Updated ")) {
      const [createdPart, updatedPart] = timestampPart.split(" - Updated ");
      created = createdPart?.trim() || new Date().toISOString();
      updated = updatedPart?.trim() || created;
    } else {
      created = timestampPart.trim();
      updated = created;
    }

    // Extract the entry content (everything after the title until ---)
    const entryContentStart = section.indexOf("\n", headerEndIndex) + 1;
    const entryContentEnd = section.indexOf("\n---");
    const entryContent = section.substring(
      entryContentStart,
      entryContentEnd === -1 ? undefined : entryContentEnd,
    );

    // Parse the entry content with formatter
    // Add back the title header for the formatter to parse
    const formatter = this.createEntryFormatter(title);
    const entryWithTitle = `# ${title}\n\n${entryContent}`;

    try {
      const parsedEntry = formatter.parse(entryWithTitle);
      return {
        title,
        created,
        updated,
        ...parsedEntry,
      };
    } catch {
      // Fallback: create a basic entry if parsing fails
      return {
        title,
        content: entryContent.trim(),
        created,
        updated,
        windowStart: 0,
        windowEnd: 0,
      };
    }
  }

  /**
   * Parse summary body from markdown content
   */
  public parseSummaryContent(content: string): SummaryBody {
    const entries: SummaryLogEntry[] = [];

    // Extract conversation ID from title
    const titleMatch = content.match(/^# Conversation Summary: (.+)$/m);
    const conversationId = titleMatch?.[1] || "";

    // Extract metadata
    const totalMessagesMatch = content.match(/\*\*Total Messages:\*\* (\d+)/);
    const totalMessages = totalMessagesMatch?.[1]
      ? parseInt(totalMessagesMatch[1], 10)
      : 0;

    const lastUpdatedMatch = content.match(/\*\*Last Updated:\*\* (.+)/);
    const lastUpdated = lastUpdatedMatch?.[1] || new Date().toISOString();

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

    const entrySections = logSection.split(/^### \[/m).slice(1); // Skip content before first entry

    for (const section of entrySections) {
      const entry = this.parseEntry(section);
      if (entry) {
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

    return {
      entityType: "summary",
      content: markdown,
      created: body.entries[body.entries.length - 1]?.created || new Date().toISOString(),
      updated: body.lastUpdated,
      metadata: {
        conversationId: body.conversationId,
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
    return entity.metadata || {};
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
        totalMessages: newEntry.windowEnd,
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
          windowEnd: newEntry.windowEnd, // Update window end
          // Merge arrays if they exist
          keyPoints: [
            ...(existingEntry.keyPoints || []),
            ...(newEntry.keyPoints || []),
          ],
          decisions: [
            ...(existingEntry.decisions || []),
            ...(newEntry.decisions || []),
          ],
          actionItems: [
            ...(existingEntry.actionItems || []),
            ...(newEntry.actionItems || []),
          ],
          participants: Array.from(
            new Set([
              ...(existingEntry.participants || []),
              ...(newEntry.participants || []),
            ]),
          ),
        };
      } else {
        // Prepend new entry (newest first)
        body.entries.unshift(newEntry);
      }

      body.totalMessages = Math.max(body.totalMessages, newEntry.windowEnd);
      body.lastUpdated = newEntry.created;
    }

    return this.createSummaryContent(body);
  }
}
