import { parseMarkdown } from "@brains/sdk/entities";
import type { SummaryBody, SummaryEntry } from "../schemas/summary";

/**
 * A summary's body is its own format — headed sections, each with a time
 * range, a message count, prose, and optional key points — because a summary
 * is read by people as well as parsed by the brain.
 *
 * Extracted from the adapter it used to live in: the runtime builds adapters
 * from declarations now, but how a summary reads is the package's own.
 */
export function composeSummaryBody(entries: SummaryEntry[]): string {
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

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Read the entries back out. A section without a time range and a message
 * count is dropped rather than guessed at — a half-parsed entry would be
 * reported as summary the brain never wrote.
 */
export function parseSummaryBody(content: string): SummaryBody {
  const body = content.startsWith("---")
    ? parseMarkdown(content).content
    : content;
  return {
    entries: body
      .split(/^##\s+/m)
      .slice(1)
      .map(parseEntry)
      .filter((entry): entry is SummaryEntry => entry !== null),
  };
}

function appendList(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(`### ${title}`);
  lines.push("");
  for (const item of items) lines.push(`- ${item}`);
  lines.push("");
}

function parseEntry(section: string): SummaryEntry | null {
  const [rawTitle = "", ...rest] = section.split("\n");
  const title = rawTitle.trim();
  const text = rest.join("\n").trim();
  const timeMatch = /^Time:\s*(.*?)\s*→\s*(.*?)\s*$/m.exec(text);
  const countMatch = /^Messages summarized:\s*(\d+)\s*$/m.exec(text);
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
    keyPoints: parseList(text, "Key Points"),
  };
}

function parseList(text: string, title: string): string[] {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `^###\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^###\\s+|$)`,
    "m",
  ).exec(text);
  const listText = match?.[1]?.trim();
  if (!listText) return [];

  return listText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}
