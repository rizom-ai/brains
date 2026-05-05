import { BaseEntityAdapter } from "@brains/plugins";
import {
  summarySchema,
  summaryMetadataSchema,
  type SummaryBody,
  type SummaryEntity,
  type SummaryEntry,
  type SummaryMetadata,
} from "../schemas/summary";
import { SUMMARY_ENTITY_TYPE } from "../lib/constants";

export class SummaryAdapter extends BaseEntityAdapter<
  SummaryEntity,
  SummaryMetadata
> {
  constructor() {
    super({
      entityType: SUMMARY_ENTITY_TYPE,
      schema: summarySchema,
      frontmatterSchema: summaryMetadataSchema,
    });
  }

  public createContentBody(entries: SummaryEntry[]): string {
    const lines: string[] = ["# Conversation Summary", ""];

    for (const entry of entries) {
      lines.push(`## ${entry.title}`);
      lines.push("");
      lines.push(`Time: ${entry.timeRange.start} → ${entry.timeRange.end}  `);
      lines.push(`Messages summarized: ${entry.sourceMessageCount}`);
      lines.push("");
      lines.push(entry.summary.trim());
      lines.push("");
      this.appendList(lines, "Key Points", entry.keyPoints);
      this.appendList(lines, "Decisions", entry.decisions);
      this.appendList(lines, "Action Items", entry.actionItems);
    }

    return lines.join("\n").trimEnd() + "\n";
  }

  public composeContent(
    entries: SummaryEntry[],
    metadata: SummaryMetadata,
  ): string {
    return this.buildMarkdown(
      this.createContentBody(entries),
      metadata as Record<string, unknown>,
    );
  }

  public parseBody(content: string): SummaryBody {
    const body = content.startsWith("---")
      ? this.extractBody(content)
      : content;
    const sections = body.split(/^##\s+/m).slice(1);
    const entries = sections.map((section) => this.parseEntry(section));
    return {
      entries: entries.filter((entry): entry is SummaryEntry => entry !== null),
    };
  }

  public override toMarkdown(entity: SummaryEntity): string {
    const { entries } = this.parseBody(entity.content);
    return this.composeContent(entries, entity.metadata);
  }

  public fromMarkdown(markdown: string): Partial<SummaryEntity> {
    const metadata = this.parseFrontMatter(markdown, summaryMetadataSchema);

    return {
      entityType: SUMMARY_ENTITY_TYPE,
      content: markdown,
      metadata,
    };
  }

  public override extractMetadata(entity: SummaryEntity): SummaryMetadata {
    return entity.metadata;
  }

  private appendList(lines: string[], title: string, items: string[]): void {
    if (items.length === 0) return;
    lines.push(`### ${title}`);
    lines.push("");
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  private parseEntry(section: string): SummaryEntry | null {
    const [rawTitle = "", ...rest] = section.split("\n");
    const title = rawTitle.trim();
    const text = rest.join("\n").trim();
    const timeMatch = text.match(/^Time:\s*(.*?)\s*→\s*(.*?)\s*$/m);
    const countMatch = text.match(/^Messages summarized:\s*(\d+)\s*$/m);
    if (!title || !timeMatch || !countMatch) return null;

    const summary = text
      .replace(/^Time:.*$/m, "")
      .replace(/^Messages summarized:.*$/m, "")
      .split(/^###\s+/m)[0]
      ?.trim();

    if (!summary) return null;

    return {
      title,
      summary,
      timeRange: {
        start: timeMatch[1]?.trim() ?? "",
        end: timeMatch[2]?.trim() ?? "",
      },
      sourceMessageCount: Number(countMatch[1]),
      keyPoints: this.parseList(text, "Key Points"),
      decisions: this.parseList(text, "Decisions"),
      actionItems: this.parseList(text, "Action Items"),
    };
  }

  private parseList(text: string, title: string): string[] {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(
      new RegExp(
        `^###\\s+${escapedTitle}\\s*\\n([\\s\\S]*?)(?=^###\\s+|$)`,
        "m",
      ),
    );
    const listText = match?.[1]?.trim();
    if (!listText) return [];

    return listText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
  }
}
