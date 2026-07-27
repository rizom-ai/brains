import { SYSTEM_CHANNELS, type EntityPluginContext } from "@brains/plugins";
import {
  buildRecentConversationMemoryData,
  RECENT_MEMORY_WIDGET_ID,
} from "./recent-memory";
import { RecentConversationMemoryWidget } from "./recent-memory-widget";

export function registerRecentConversationMemoryWidget(params: {
  context: EntityPluginContext;
}): void {
  const { context } = params;
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await context.dashboard.registerWidget({
        id: RECENT_MEMORY_WIDGET_ID,
        title: "Recent conversation memory",
        group: "knowledge",
        section: "secondary",
        priority: 35,
        rendererName: "CustomWidget",
        component: RecentConversationMemoryWidget,
        dataProvider: () => buildRecentConversationMemoryData(context),
      });
      return { success: true };
    },
  );
}
