import type { EntityPluginContext } from "@brains/plugins";
import { firstSentence } from "@brains/utils";
import type { ActionItemEntity } from "../../schemas/conversation-memory";
import { ACTION_ITEM_ENTITY_TYPE } from "../constants";
import { channelLabel, formatAge } from "./format";

const MAX_ITEMS = 6;
const WIDGET_ID = "conversation-memory:action-items";

export interface ActionItemWidgetItem {
  id: string;
  name: string;
  description?: string;
  meta: string[];
  status: ActionItemEntity["metadata"]["status"];
}

export interface ActionItemsWidgetData {
  items: ActionItemWidgetItem[];
}

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
  context: EntityPluginContext,
  now: Date = new Date(),
): Promise<ActionItemsWidgetData> {
  const items = await context.entityService.listEntities<ActionItemEntity>({
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
  };
}

export function registerActionItemsWidget(params: {
  context: EntityPluginContext;
  pluginId: string;
}): void {
  const { context, pluginId } = params;
  context.messaging.subscribe(
    "system:plugins:ready",
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: WIDGET_ID,
          pluginId,
          title: "Open action items",
          section: "secondary",
          priority: 25,
          rendererName: "ListWidget",
          dataProvider: () => buildActionItemsWidgetData(context),
        },
      });
      return { success: true };
    },
  );
}

export const ACTION_ITEMS_WIDGET_ID = WIDGET_ID;
