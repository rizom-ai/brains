import {
  SYSTEM_CHANNELS,
  type EntityPluginContext,
  DASHBOARD_CHANNELS,
} from "@brains/plugins";
import {
  buildRecentConversationMemoryData,
  RECENT_MEMORY_WIDGET_ID,
} from "./recent-memory";
import { RecentConversationMemoryWidget } from "./recent-memory-widget";

export function registerRecentConversationMemoryWidget(params: {
  context: EntityPluginContext;
  pluginId: string;
}): void {
  const { context, pluginId } = params;
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: DASHBOARD_CHANNELS.registerWidget,
        payload: {
          id: RECENT_MEMORY_WIDGET_ID,
          pluginId,
          title: "Recent conversation memory",
          group: "knowledge",
          section: "secondary",
          priority: 35,
          rendererName: "CustomWidget",
          component: RecentConversationMemoryWidget,
          dataProvider: () => buildRecentConversationMemoryData(context),
        },
      });
      return { success: true };
    },
  );
}
