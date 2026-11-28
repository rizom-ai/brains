import type { StudioPalette } from "../../src/palette-contract";

/** What choosing a palette item does. */
export type PaletteCommand =
  | { kind: "ask-entry" }
  | { kind: "ask-brain"; question: string }
  | { kind: "create"; entityType: string }
  | { kind: "climate" }
  | { kind: "open"; href: string }
  /** A page's action, run with no input; then its page opens. */
  | { kind: "run"; workspaceId: string; actionId: string; href: string };

export interface PaletteItem {
  id: string;
  title: string;
  sub?: string | undefined;
  kbd?: string | undefined;
  command: PaletteCommand;
}

export interface PaletteSection {
  id: string;
  label: string;
  items: PaletteItem[];
}

/** A type as the palette needs it: whether a new entry can be started. */
export interface PaletteType {
  entityType: string;
  singularLabel: string;
  classification: string;
  isSingleton: boolean;
  canCreate: boolean;
}

/** Actions shown before anything is typed, so pages stay in view. */
const IDLE_ACTIONS = 4;

function matches(title: string, query: string): boolean {
  return title.toLowerCase().includes(query.toLowerCase());
}

/**
 * The palette for one query: asking about what is open, then what can be
 * done (start an entry, ask the brain, switch light and dark), then the
 * pages and entries Studio found. A section with nothing in it is left out.
 */
export function paletteSections(input: {
  query: string;
  types: readonly PaletteType[];
  hasChat: boolean;
  /** The entry being edited, when Ask can be about it. */
  openEntry: { typeLabel: string } | null;
  remote: StudioPalette | null;
}): PaletteSection[] {
  const query = input.query.trim();
  const forOpen: PaletteItem[] =
    input.openEntry && input.hasChat
      ? [
          {
            id: "ask-entry",
            title: `Ask about this ${input.openEntry.typeLabel}`,
            kbd: "⌘J",
            command: { kind: "ask-entry" as const },
          },
        ].filter((item) => !query || matches(item.title, query))
      : [];
  const creates: PaletteItem[] = input.types
    .filter(
      (type) =>
        type.canCreate && !type.isSingleton && type.classification !== "system",
    )
    .map((type) => ({
      id: `create:${type.entityType}`,
      title: `New ${type.singularLabel.toLowerCase()}`,
      command: { kind: "create" as const, entityType: type.entityType },
    }));
  const climate: PaletteItem = {
    id: "climate",
    title: "Switch light and dark",
    command: { kind: "climate" },
  };
  const actions: PaletteItem[] = query
    ? [
        ...[...creates, climate].filter((item) => matches(item.title, query)),
        ...(input.hasChat
          ? [
              {
                id: "ask-brain",
                title: `Ask your brain “${query}”`,
                command: { kind: "ask-brain" as const, question: query },
              },
            ]
          : []),
      ]
    : [...creates.slice(0, IDLE_ACTIONS - 1), climate];
  const remote: PaletteSection[] = (input.remote?.groups ?? []).map(
    (group) => ({
      id: group.id,
      label: group.label,
      items: group.items.map((item): PaletteItem => ({
        id: `${group.id}:${item.id}`,
        title: item.title,
        sub: item.sub,
        command: item.run
          ? { kind: "run", ...item.run, href: item.href }
          : { kind: "open", href: item.href },
      })),
    }),
  );
  // What the pages offer joins the palette's own actions, after them.
  const pageActions = remote
    .filter((section) => section.id === "actions")
    .flatMap((section) => section.items);
  const allActions = [...actions, ...pageActions];
  return [
    ...(forOpen.length > 0 && input.openEntry
      ? [
          {
            id: "for-open",
            label: `For this ${input.openEntry.typeLabel}`,
            items: forOpen,
          },
        ]
      : []),
    ...(allActions.length > 0
      ? [{ id: "actions", label: "Actions", items: allActions }]
      : []),
    ...remote.filter((section) => section.id !== "actions"),
  ].filter((section) => section.items.length > 0);
}

/** The next item to highlight, wrapping at either end; -1 when none. */
export function stepActive(
  index: number,
  delta: number,
  count: number,
): number {
  if (count === 0) return -1;
  return (((index + delta) % count) + count) % count;
}
