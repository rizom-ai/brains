import type { EntityPluginContext } from "@brains/plugins";
import type { SummaryEntity } from "../schemas/summary";
import { SUMMARY_ENTITY_TYPE, SUMMARY_PLUGIN_ID } from "./constants";

const MAX_SUMMARY_WIDGET_ITEMS = 10;

function getSummaryLabel(summary: SummaryEntity): string {
  const channelName = summary.metadata.channelName?.trim();
  if (channelName) return channelName;
  return summary.metadata.channelId;
}

export function registerSummaryDashboardWidget(params: {
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
          id: SUMMARY_PLUGIN_ID,
          pluginId,
          title: "Summaries",
          section: "secondary",
          priority: 30,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const summaries =
              await context.entityService.listEntities<SummaryEntity>({
                entityType: SUMMARY_ENTITY_TYPE,
                options: {
                  limit: MAX_SUMMARY_WIDGET_ITEMS,
                  sortFields: [{ field: "updated", direction: "desc" }],
                },
              });

            return {
              items: summaries.map((summary) => ({
                id: summary.id,
                name: getSummaryLabel(summary),
                count: summary.metadata.entryCount,
                status: `${summary.metadata.messageCount} msgs`,
              })),
            };
          },
        },
      });
      return { success: true };
    },
  );
}
