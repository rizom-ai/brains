import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import { summaryBodySchema, type SummaryEntry } from "../schemas/summary";

/*
 * A summary's markdown body: "# Conversation Summary", then one "## <title>"
 * section per entry with its time range, message count, prose and key
 * points. Read and written as the summary adapter did.
 */

function appendList(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(`### ${title}`);
  lines.push("");
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function renderEntries(entries: SummaryEntry[]): string {
  const lines: string[] = ["# Conversation Summary", ""];

  for (const entry of entries) {
    lines.push(`## ${entry.title}`);
    lines.push("");
    lines.push(`Time: ${entry.timeRange.start} → ${entry.timeRange.end}  `);
    lines.push(`Messages summarized: ${entry.sourceMessageCount}`);
    lines.push("");
    lines.push(entry.summary.trim());
    lines.push("");
    appendList(lines, "Key Points", entry.keyPoints);
  }

  return lines.join("\n").trimEnd() + "\n";
}

function parseList(text: string, title: string): string[] {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`^###\\s+${escapedTitle}\\s*\\n([\\s\\S]*?)(?=^###\\s+|$)`, "m"),
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

function parseEntry(section: string): SummaryEntry {
  const [rawTitle = "", ...rest] = section.split("\n");
  const title = rawTitle.trim();
  const text = rest.join("\n").trim();
  const timeMatch = text.match(/^Time:\s*(.*?)\s*→\s*(.*?)\s*$/m);
  const countText = text
    .match(/^Messages summarized:[ \t]*([^\r\n]*)$/m)?.[1]
    ?.trim();

  const summary =
    text
      .replace(/^Time:.*$/m, "")
      .replace(/^Messages summarized:.*$/m, "")
      .split(/^###\s+/m)[0]
      ?.trim() ?? "";

  // The body codec validates the complete entry. Silently omitting an
  // invalid timestamp here would erase that entry on the next export.
  return {
    title,
    summary,
    timeRange: {
      start: timeMatch?.[1]?.trim() ?? "",
      end: timeMatch?.[2]?.trim() ?? "",
    },
    sourceMessageCount: countText ? Number(countText) : Number.NaN,
    keyPoints: parseList(text, "Key Points"),
  };
}

/** Parse every entry; the codec rejects malformed data without dropping it. */
function readEntries(body: string): SummaryEntry[] {
  return body
    .split(/^##\s+/m)
    .slice(1)
    .map((section) => parseEntry(section));
}

/** Markdown body ↔ summary entries; a write is validated like a read. */
export const summaryBodyCodec: z.ZodCodec<
  z.ZodString,
  typeof summaryBodySchema
> = z.codec(z.string(), summaryBodySchema, {
  decode: (body) => ({ entries: readEntries(body) }),
  encode: ({ entries }) => renderEntries(entries),
});

/** A summary's entries, from its body or a whole stored document. */
export function parseSummaryBody(content: string): { entries: SummaryEntry[] } {
  const body = content.startsWith("---")
    ? readMarkdownFrontmatter(content).content
    : content;
  return z.decode(summaryBodyCodec, body);
}

/** The body a summary's entries are written as. */
export function composeSummaryBody(entries: SummaryEntry[]): string {
  return z.encode(summaryBodyCodec, { entries });
}
