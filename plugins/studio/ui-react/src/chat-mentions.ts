import { studioEntityPath } from "../../src/studio-paths";

/** A source an answer drew on, as its sources card carries it. */
export interface CitedSource {
  id: string;
  title?: string | undefined;
  source: string;
  url?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
}

/** Shorter titles match ordinary words too often to be linked. */
const MIN_TITLE_LENGTH = 4;

/** Where a source opens: its entry in Studio, or the page it came from. */
export function sourceHref(
  source: CitedSource,
  basePath: string,
): string | undefined {
  if (source.entityType && source.entityId)
    return studioEntityPath(basePath, source.entityType, source.entityId);
  return source.url;
}

/** Whether the text at this offset is inside inline code or a link's label. */
function insideMarkup(text: string, offset: number): boolean {
  const before = text.slice(0, offset);
  const backticks = before.split("`").length - 1;
  if (backticks % 2 === 1) return true;
  const openBracket = before.lastIndexOf("[");
  const closeBracket = before.lastIndexOf("]");
  return openBracket > closeBracket;
}

/**
 * The answer with the first plain mention of each entry it cites linked to
 * that entry in Studio. Mentions in code or in a link stay as written.
 */
export function linkCitedTitles(
  content: string,
  sources: readonly CitedSource[],
  basePath: string,
): string {
  return sources.reduce((text, source) => {
    const title = source.title?.trim();
    if (!title || title.length < MIN_TITLE_LENGTH) return text;
    if (!source.entityType || !source.entityId) return text;
    const at = text.indexOf(title);
    if (at < 0 || insideMarkup(text, at)) return text;
    const href = studioEntityPath(basePath, source.entityType, source.entityId);
    return `${text.slice(0, at)}[${title}](${href})${text.slice(at + title.length)}`;
  }, content);
}

/**
 * What a new conversation offers to start with, from what this brain has:
 * its pages and the types it writes. Never more than four.
 */
export function chatStarters(input: {
  types: readonly string[];
  workspaces: readonly string[];
}): string[] {
  const has = (id: string): boolean =>
    input.workspaces.some((workspace) => workspace.endsWith(`:${id}`));
  const starters = [
    ...(has("inbox") ? ["Summarize what is in my inbox this week"] : []),
    ...(has("publishing") ? ["What did I publish last month?"] : []),
    ...(input.types.includes("post")
      ? ["Draft a post from my recent notes"]
      : []),
    ...(input.types.includes("note")
      ? ["What have I been writing about lately?"]
      : []),
  ].slice(0, 4);
  return starters.length > 0 ? starters : ["What can you help me with?"];
}
