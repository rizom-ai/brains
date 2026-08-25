import {
  defineDashboardWidget,
  defineEntityDashboardWidget,
  firstSentence,
  z,
  type EntityDashboardWidgetDeclaration,
  type JobEntityAccess,
} from "@brains/sdk/entities";
import type { DecisionEntity } from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import { channelLabel, formatTimeRange } from "./format";

const MAX_ITEMS = 6;
const WIDGET_ID = "decisions";

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

const decisionsWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      meta: z.array(z.string()),
      status: z.enum(["active", "superseded"]),
    }),
  ),
});

const decisionsWidget = defineDashboardWidget({
  id: WIDGET_ID,
  title: "Recent decisions",
  group: "knowledge",
  placement: "secondary",
  priority: 30,
  permission: "public",
  data: decisionsWidgetDataSchema,
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "decisions",
        empty: "No decisions recorded yet.",
        items: data.items.map((item) => ({
          id: item.id,
          title: item.name,
          ...(item.description ? { description: item.description } : {}),
          metadata: item.meta,
          badges: [
            {
              label: item.status,
              tone: item.status === "active" ? "good" : "neutral",
            },
          ],
        })),
      },
    ],
  }),
});

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
  entities: JobEntityAccess,
): Promise<DecisionsWidgetData> {
  const items = await entities.listEntities<DecisionEntity>({
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

/**
 * Declared rather than registered: waiting for the dashboard to mount before
 * announcing a static fact is the runtime's job, and four widgets in this
 * package were each subscribing to a lifecycle channel to do it.
 */
export const decisionsWidgetDeclaration: EntityDashboardWidgetDeclaration =
  defineEntityDashboardWidget(decisionsWidget, ({ entities, signal }) => {
    signal.throwIfAborted();
    return buildDecisionsWidgetData(entities);
  });

export const DECISIONS_WIDGET_ID: typeof WIDGET_ID = WIDGET_ID;
