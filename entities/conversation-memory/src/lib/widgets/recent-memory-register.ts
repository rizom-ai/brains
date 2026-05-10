import type { EntityPluginContext } from "@brains/plugins";
import {
  buildRecentConversationMemoryData,
  RECENT_MEMORY_WIDGET_ID,
} from "./recent-memory";
import {
  RecentConversationMemoryWidget,
  recentConversationMemoryScript,
} from "./recent-memory-widget";

export function registerRecentConversationMemoryWidget(params: {
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
          id: RECENT_MEMORY_WIDGET_ID,
          pluginId,
          title: "Recent conversation memory",
          section: "secondary",
          priority: 35,
          rendererName: "CustomWidget",
          component: RecentConversationMemoryWidget,
          clientScript: recentConversationMemoryScript,
          dataProvider: () => buildRecentConversationMemoryData(context),
        },
      });
      return { success: true };
    },
  );
}
