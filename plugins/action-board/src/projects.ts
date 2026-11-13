import type { ContentVisibility } from "@brains/sdk/internal/service-runtime";
import type { BoardContext } from "./board-context";
import {
  ACTION_ITEM_ENTITY_TYPE,
  actionItemSchema,
  type ActionItemEntity,
} from "@brains/action-items";

/** Grouping reads page at most this many entries. */
const PAGE_LIMIT = 100;
/** Filter options carry the value as a label, so it must be one. */
const LABEL_LENGTH = 160;

type VisibilityScope = ContentVisibility;

/** The grouping key when the brain defines it over action items; otherwise there are no projects. */
export async function definedProjectGrouping(
  context: BoardContext,
  key: string,
): Promise<string | undefined> {
  await context.groupings.ensureGroupingsCurrent();
  return context.groupings
    .getGroupings()
    .some(
      (grouping) =>
        grouping.key === key &&
        grouping.types.includes(ACTION_ITEM_ENTITY_TYPE),
    )
    ? key
    : undefined;
}

/** Each project the caller can see, with how many action items it holds. */
export async function projectOptions(
  context: BoardContext,
  grouping: string,
  visibilityScope: VisibilityScope,
): Promise<{ value: string; label: string; count: number }[]> {
  const catalog = await context.groupings.queryGroupingCatalog({
    grouping,
    entityTypes: [ACTION_ITEM_ENTITY_TYPE],
    visibilityScope,
    limit: PAGE_LIMIT,
  });
  return catalog.values
    .filter(
      ({ value }) =>
        value.length > 0 &&
        value.length <= LABEL_LENGTH &&
        value.trim() === value,
    )
    .map(({ value, count }) => ({ value, label: value, count }));
}

/** Every action item in a project, newest first, read page by page. */
export async function projectMembers(
  context: BoardContext,
  request: {
    grouping: string;
    value: string;
    visibilityScope: VisibilityScope;
  },
  offset = 0,
): Promise<ActionItemEntity[]> {
  const page = await context.groupings.queryGroupingMembers({
    grouping: request.grouping,
    value: request.value,
    entityTypes: [ACTION_ITEM_ENTITY_TYPE],
    visibilityScope: request.visibilityScope,
    limit: PAGE_LIMIT,
    offset,
    sort: "updated-desc",
  });
  const members = page.entities.map((entity) => actionItemSchema.parse(entity));
  const next = offset + page.entities.length;
  return page.entities.length > 0 && next < page.total
    ? [...members, ...(await projectMembers(context, request, next))]
    : members;
}
