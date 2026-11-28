import type { ConsoleJumpDestination } from "@brains/contracts";
import { entityTypeLabels, type EntityDisplayLabel } from "./config";
import type { StudioPalette, StudioPaletteItem } from "./palette-contract";
import type { StudioContext } from "./studio-context";
import type { StudioRequestAccess } from "./editor-contracts";
import { studioEntityPath, studioWorkspacePath } from "./studio-paths";
import type { StudioPaletteWorkspaceAction } from "./workspace-registry";

/** The fewest letters worth a search; one matches almost everything. */
const MIN_SEARCH = 2;
const MAX_ENTRIES = 6;

/** At most this many pages, so entries stay in view. */
const MAX_PAGES = 8;

function matches(destination: ConsoleJumpDestination, query: string): boolean {
  const needle = query.toLowerCase();
  return [
    destination.title,
    destination.sub ?? "",
    ...(destination.keywords ?? []),
  ].some((text) => text.toLowerCase().includes(needle));
}

function pageItem(destination: ConsoleJumpDestination): StudioPaletteItem {
  return {
    id: destination.id,
    title: destination.title,
    ...(destination.sub ? { sub: destination.sub } : {}),
    href: destination.href,
  };
}

/**
 * The palette for one query: the pages the caller may open (the main ones
 * before anything is typed), then the entries a search found. A group with
 * nothing in it is left out.
 */
export function paletteGroups(input: {
  query: string;
  destinations: readonly ConsoleJumpDestination[];
  entries: readonly StudioPaletteItem[];
  actions?: readonly StudioPaletteWorkspaceAction[] | undefined;
  routePath?: string | undefined;
}): StudioPalette {
  const query = input.query.trim();
  const needle = query.toLowerCase();
  const actions = (input.actions ?? [])
    .filter(
      (action) =>
        !needle ||
        action.label.toLowerCase().includes(needle) ||
        action.workspaceLabel.toLowerCase().includes(needle),
    )
    .map((action) => ({
      id: `${action.workspaceId}:${action.name}`,
      title: action.label,
      sub: action.workspaceLabel,
      href: studioWorkspacePath(input.routePath ?? "", action.workspaceId),
      run: { workspaceId: action.workspaceId, actionId: action.name },
    }));
  const pages = input.destinations
    .filter((destination) =>
      query ? matches(destination, query) : destination.primary === true,
    )
    .slice(0, MAX_PAGES)
    .map(pageItem);
  return {
    groups: [
      ...(actions.length > 0
        ? [{ id: "actions" as const, label: "Actions", items: actions }]
        : []),
      ...(pages.length > 0
        ? [{ id: "pages" as const, label: "Pages", items: pages }]
        : []),
      ...(input.entries.length > 0
        ? [
            {
              id: "entries" as const,
              label: "Entries",
              items: [...input.entries],
            },
          ]
        : []),
    ],
  };
}

/**
 * The entries a palette query finds, read at the caller's scope. A search
 * that fails, as while the index warms, finds none rather than failing the
 * palette.
 */
export async function paletteEntries(input: {
  context: StudioContext;
  routePath: string;
  query: string;
  visibilityScope: StudioRequestAccess["visibilityScope"];
  entityDisplay: Partial<Record<string, EntityDisplayLabel>> | undefined;
}): Promise<StudioPaletteItem[]> {
  const query = input.query.trim();
  if (query.length < MIN_SEARCH) return [];
  const results = await input.context.entityService
    .search({
      query,
      options: { limit: MAX_ENTRIES, visibilityScope: input.visibilityScope },
    })
    .catch(() => []);
  return results.map(({ entity }) => ({
    id: `${entity.entityType}:${entity.id}`,
    title: input.context.shapes.displayTitle(entity) ?? entity.id,
    sub: entityTypeLabels(
      entity.entityType,
      input.entityDisplay?.[entity.entityType],
    ).label,
    href: studioEntityPath(input.routePath, entity.entityType, entity.id),
  }));
}
