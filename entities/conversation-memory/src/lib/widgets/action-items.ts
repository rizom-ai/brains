import {
  actionItemSchema,
  actionItemStatusSchema,
  type ActionItemEntity,
  type ActionItemStatus,
  ACTION_ITEM_ENTITY_TYPE,
  formatAge,
  actionItemCapturedAt,
  actionItemSource,
} from "@brains/action-items";
import type { ContentVisibility } from "@brains/plugins";
import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type EntityPluginContext,
} from "@brains/plugins";
import { firstSentence } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

const MAX_ITEMS = 6;
const WIDGET_ID = "action-items";

export interface ActionItemWidgetItem {
  id: string;
  name: string;
  description?: string;
  meta: string[];
  status: ActionItemEntity["metadata"]["status"];
}

export interface ActionItemsWidgetData {
  items: ActionItemWidgetItem[];
  /** Open, doing and blocked items, uncapped (the list is truncated for display). */
  unfinishedCount: number;
  blockedCount: number;
}

const actionItemsWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      meta: z.array(z.string()),
      status: actionItemStatusSchema,
    }),
  ),
  unfinishedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
});

const actionItemsWidget = defineDashboardWidget({
  id: WIDGET_ID,
  title: "Open action items",
  group: "knowledge",
  placement: "secondary",
  priority: 25,
  // Action items are shared or restricted memory; members read them in Studio
  // Overview, where blocked items ask for attention.
  permission: "trusted",
  data: actionItemsWidgetDataSchema,
  digest: ({ data }) => ({
    items: [
      { label: "Open actions", value: String(data.unfinishedCount) },
      {
        label: "Blocked",
        value: String(data.blockedCount),
        ...(data.blockedCount > 0 ? { tone: "warn" } : {}),
      },
    ],
    // Open work is the board's business; a blocker is what needs someone.
    attention: data.blockedCount,
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "action-items",
        empty: "No action items yet.",
        items: data.items.map((item) => ({
          id: item.id,
          title: item.name,
          ...(item.description ? { description: item.description } : {}),
          metadata: item.meta,
          badges: [
            {
              label: item.status,
              tone: item.status === "blocked" ? "warn" : "neutral",
            },
          ],
        })),
      },
      {
        type: "links",
        items: [
          { label: "Open the board", target: { launch: { target: "board" } } },
        ],
      },
    ],
  }),
});

const UNFINISHED: ReadonlySet<ActionItemStatus> = new Set([
  "blocked",
  "doing",
  "open",
]);

/** Blockers first: they are what the widget is for. */
function statusOrder(status: ActionItemStatus): number {
  switch (status) {
    case "blocked":
      return 0;
    case "doing":
      return 1;
    default:
      return 2;
  }
}

function entityTitle(entity: ActionItemEntity): string {
  const match = entity.content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? entity.id;
}

function entityBody(entity: ActionItemEntity): string {
  return entity.content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#\s+.+$/m, "")
    .trim();
}

export async function buildActionItemsWidgetData(
  context: EntityPluginContext,
  visibilityScope: ContentVisibility,
  now: Date = new Date(),
): Promise<ActionItemsWidgetData> {
  const items = await context.entityService.listEntities(
    {
      entityType: ACTION_ITEM_ENTITY_TYPE,
      options: { filter: { visibilityScope } },
    },
    actionItemSchema,
  );

  const unfinished = items.filter((entity) =>
    UNFINISHED.has(entity.metadata.status),
  );
  const sorted = [...unfinished].sort((a, b) => {
    const statusDiff =
      statusOrder(a.metadata.status) - statusOrder(b.metadata.status);
    if (statusDiff !== 0) return statusDiff;
    return actionItemCapturedAt(b).localeCompare(actionItemCapturedAt(a));
  });

  return {
    items: sorted.slice(0, MAX_ITEMS).map((entity) => {
      const description = firstSentence(entityBody(entity));
      const meta = [
        actionItemSource(entity).place,
        formatAge(actionItemCapturedAt(entity), now),
      ].filter((segment) => segment.length > 0);
      return {
        id: entity.id,
        name: entityTitle(entity),
        ...(description ? { description } : {}),
        meta,
        status: entity.metadata.status,
      };
    }),
    unfinishedCount: unfinished.length,
    blockedCount: unfinished.filter(
      (entity) => entity.metadata.status === "blocked",
    ).length,
  };
}

export function registerActionItemsWidget(params: {
  context: EntityPluginContext;
}): void {
  const { context } = params;
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: actionItemsWidget,
        load: ({ visibilityScope, signal }) => {
          signal.throwIfAborted();
          return buildActionItemsWidgetData(context, visibilityScope);
        },
      });
      return { success: true };
    },
  );
}

export const ACTION_ITEMS_WIDGET_ID: typeof WIDGET_ID = WIDGET_ID;
