import { sourceBrainSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";

type StoredSourceSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  url: z.ZodOptional<z.ZodURL>;
  brain: z.ZodOptional<typeof sourceBrainSchema>;
}>;

/**
 * A source a stored body lists: the piece, its address and, when it came
 * from another brain, that brain. What it quoted is not kept.
 */
export const storedSourceSchema: StoredSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url().optional(),
  brain: sourceBrainSchema.optional(),
});

export type StoredSource = z.output<typeof storedSourceSchema>;

/**
 * One source as a list item: its title linked to its address (the brain's
 * reference to it rides as the link title when it has a public address)
 * and the brain it came from.
 */
const SOURCE_LINE =
  /^- \[((?:\\.|[^\]\\])+)\]\((<[^>]*>|\S+?)(?: "([^"]+)")?\)(?: — from (?:\[((?:\\.|[^\]\\])+)\]\((\S+?)\)|(.+)))?$/;

const HTTP_URL = /^https?:\/\//;

function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

function unescapeLinkText(text: string): string {
  return text.replace(/\\([\\[\]])/g, "$1");
}

function sourceItem(source: StoredSource): string {
  const title = escapeLinkText(source.title);
  // A reference with spaces is no bare link target; angle brackets keep it.
  const reference = /[\s()]/.test(source.id) ? `<${source.id}>` : source.id;
  const link = source.url
    ? `[${title}](${source.url} "${source.id}")`
    : `[${title}](${reference})`;
  const brain = source.brain
    ? ` — from ${
        source.brain.url
          ? `[${escapeLinkText(source.brain.name)}](${source.brain.url})`
          : source.brain.name
      }`
    : "";
  return `- ${link}${brain}`;
}

/**
 * A source read back from its list item. A line that is not one comes back
 * without an id, so the body fails validation instead of losing it.
 */
function parseSourceItem(line: string): StoredSource {
  const match = SOURCE_LINE.exec(line);
  if (!match) return { id: "", title: line };
  const [
    ,
    rawTitle = "",
    target = "",
    reference,
    brainLinked,
    brainUrl,
    brainPlain,
  ] = match;
  const brainName = brainLinked
    ? unescapeLinkText(brainLinked)
    : brainPlain?.trim();
  const destination = target.replace(/^<(.*)>$/, "$1");
  return {
    id: reference ?? destination,
    title: unescapeLinkText(rawTitle),
    ...(HTTP_URL.test(destination) ? { url: destination } : {}),
    ...(brainName
      ? { brain: { name: brainName, ...(brainUrl ? { url: brainUrl } : {}) } }
      : {}),
  };
}

/** Sources as a stored body lists them: one linked item per source. */
export function formatSourceList(sources: readonly StoredSource[]): string {
  return sources.map(sourceItem).join("\n");
}

/** A stored list's markdown back as sources, one per list item. */
export function parseSourceList(markdown: string): StoredSource[] {
  return markdown
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseSourceItem(line.trim()));
}
