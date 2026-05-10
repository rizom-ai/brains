import type { EntityPluginContext } from "@brains/plugins";
import { firstSentence } from "@brains/utils";
import type { DecisionEntity } from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import { channelLabel, formatTimeRange } from "./format";

const MAX_ITEMS = 6;
const WIDGET_ID = "conversation-memory:decisions";

export interface DecisionWidgetItem {
  id: string;
  name: string;
  description?: string;
  meta: string[];
  status: DecisionEntity["metadata"]["status"];
}

export interface DecisionsWidgetData {
  items: DecisionWidgetItem[];
}

function statusOrder(status: DecisionEntity["metadata"]["status"]): number {
  return status === "active" ? 0 : 1;
}

function entityTitle(entity: DecisionEntity): string {
  const match = entity.content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? entity.id;
}

function entityBody(entity: DecisionEntity): string {
  return entity.content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#\s+.+$/m, "")
    .trim();
}

export async function buildDecisionsWidgetData(
  context: EntityPluginContext,
): Promise<DecisionsWidgetData> {
  const items = await context.entityService.listEntities<DecisionEntity>({
    entityType: DECISION_ENTITY_TYPE,
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
        formatTimeRange(entity.metadata.timeRange),
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

export function registerDecisionsWidget(params: {
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
          title: "Recent decisions",
          section: "secondary",
          priority: 30,
          rendererName: "ListWidget",
          dataProvider: () => buildDecisionsWidgetData(context),
        },
      });
      return { success: true };
    },
  );
}

export const DECISIONS_WIDGET_ID = WIDGET_ID;
