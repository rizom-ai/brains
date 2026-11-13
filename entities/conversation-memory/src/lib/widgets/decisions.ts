import { channelLabel } from "@brains/action-items";
import { defineDashboardWidget } from "@brains/sdk/services";
import type {
  ContentVisibility,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { MemoryEntityService } from "../memory-context";
import { z } from "@brains/utils/zod";
import { firstSentence } from "@brains/utils/string-utils";
import {
  decisionSchema,
  type DecisionEntity,
} from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import { formatTimeRange } from "./format";

const MAX_ITEMS = 6;
const WIDGET_ID = "decisions";

const decisionsWidgetDataSchema: z.ZodObject<{
  items: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      name: z.ZodString;
      description: z.ZodOptional<z.ZodString>;
      meta: z.ZodArray<z.ZodString>;
      status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
    }>
  >;
}> = z.object({
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

export type DecisionsWidgetData = z.output<typeof decisionsWidgetDataSchema>;

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
  context: {
    readonly entityService: Pick<MemoryEntityService, "listEntities">;
  },
  visibilityScope: ContentVisibility,
): Promise<DecisionsWidgetData> {
  const items = await context.entityService.listEntities(
    {
      entityType: DECISION_ENTITY_TYPE,
      options: { filter: { visibilityScope } },
    },
    decisionSchema,
  );

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

export function registerDecisionsWidget(
  runtime: Pick<ServiceRuntime, "dashboardWidget">,
  context: {
    readonly entityService: Pick<MemoryEntityService, "listEntities">;
  },
): void {
  runtime.dashboardWidget({
    definition: decisionsWidget,
    load: ({ visibilityScope, signal }) => {
      signal.throwIfAborted();
      return buildDecisionsWidgetData(context, visibilityScope);
    },
  });
}
