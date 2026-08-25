import {
  defineDashboardWidget,
  defineEntityDashboardWidget,
  firstSentence,
  z,
  type EntityDashboardWidgetDeclaration,
  type JobEntityAccess,
} from "@brains/sdk/entities";
import type { ActionItemEntity } from "../../schemas/conversation-memory";
import { ACTION_ITEM_ENTITY_TYPE } from "../constants";
import { channelLabel, formatAge } from "./format";

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
  /** Total open items, uncapped (the items list is truncated for display). */
  openCount: number;
}

const actionItemsWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      meta: z.array(z.string()),
      status: z.enum(["open", "done", "dropped"]),
    }),
  ),
  openCount: z.number().int().nonnegative(),
});

const actionItemsWidget = defineDashboardWidget({
  id: WIDGET_ID,
  title: "Open action items",
  group: "knowledge",
  placement: "secondary",
  priority: 25,
  permission: "public",
  data: actionItemsWidgetDataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "Open actions",
        value: String(data.openCount),
        ...(data.openCount > 0 ? { tone: "warn" } : {}),
      },
    ],
    attention: data.openCount,
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
              tone:
                item.status === "open"
                  ? "warn"
                  : item.status === "done"
                    ? "good"
                    : "neutral",
            },
          ],
        })),
      },
    ],
  }),
});

function statusOrder(status: ActionItemEntity["metadata"]["status"]): number {
  switch (status) {
    case "open":
      return 0;
    case "done":
      return 1;
    case "dropped":
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
  entities: JobEntityAccess,
  now: Date = new Date(),
): Promise<ActionItemsWidgetData> {
  const items = await entities.listEntities<ActionItemEntity>({
    entityType: ACTION_ITEM_ENTITY_TYPE,
  });

  const sorted = [...items].sort((a, b) => {
    const statusDiff =
      statusOrder(a.metadata.status) - statusOrder(b.metadata.status);
    if (statusDiff !== 0) return statusDiff;
    return b.metadata.timeRange.end.localeCompare(a.metadata.timeRange.end);
  });

  return {
    items: sorted.slice(0, MAX_ITEMS).map((entity) => {
      const description = firstSentence(entityBody(entity));
      const meta = [
        channelLabel(entity.metadata.channelName, entity.metadata.channelId),
        formatAge(entity.metadata.timeRange.end, now),
      ].filter((segment) => segment.length > 0);
      return {
        id: entity.id,
        name: entityTitle(entity),
        ...(description ? { description } : {}),
        meta,
        status: entity.metadata.status,
      };
    }),
    openCount: items.filter((entity) => entity.metadata.status === "open")
      .length,
  };
}

export const actionItemsWidgetDeclaration: EntityDashboardWidgetDeclaration =
  defineEntityDashboardWidget(actionItemsWidget, ({ entities, signal }) => {
    signal.throwIfAborted();
    return buildActionItemsWidgetData(entities);
  });

export const ACTION_ITEMS_WIDGET_ID: typeof WIDGET_ID = WIDGET_ID;
