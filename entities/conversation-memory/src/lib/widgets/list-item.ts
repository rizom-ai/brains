import { firstSentence } from "@brains/utils/string-utils";

/** A memory record as a widget lists it, before its status. */
export interface WidgetListItem {
  id: string;
  name: string;
  description?: string | undefined;
  meta: string[];
}

function headingOf(content: string): string | undefined {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function bodyOf(content: string): string {
  return content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#\s+.+$/m, "")
    .trim();
}

/**
 * A record as a list item: named by its heading, or its id without one,
 * described by the first sentence under it, with the meta segments it has.
 */
export function listItemOf(
  entity: { readonly id: string; readonly content: string },
  meta: readonly string[],
): WidgetListItem {
  const description = firstSentence(bodyOf(entity.content));
  return {
    id: entity.id,
    name: headingOf(entity.content) ?? entity.id,
    ...(description ? { description } : {}),
    meta: meta.filter((segment) => segment.length > 0),
  };
}

type BadgeTone = "good" | "warn" | "neutral";

/** List items as a list block's rows, each badged with its status. */
export function listBlockItems<TStatus extends string>(
  items: readonly (WidgetListItem & { status: TStatus })[],
  tone: (status: TStatus) => BadgeTone,
): {
  id: string;
  title: string;
  description?: string | undefined;
  metadata: string[];
  badges: { label: TStatus; tone: BadgeTone }[];
}[] {
  return items.map((item) => ({
    id: item.id,
    title: item.name,
    ...(item.description ? { description: item.description } : {}),
    metadata: item.meta,
    badges: [{ label: item.status, tone: tone(item.status) }],
  }));
}
