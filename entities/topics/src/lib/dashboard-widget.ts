import type { EntityPluginContext } from "@brains/plugins";
import { TopicAdapter } from "./topic-adapter";
import type { TopicEntity } from "../schemas/topic";

const adapter = new TopicAdapter();

/** First sentence of a text block, capped at 200 chars with ellipsis. */
function firstSentence(text: string): string | undefined {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(.*?[.!?])(?:\s|$)/);
  if (match?.[1]) return match[1];
  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}…`;
}

export function registerTopicsDashboardWidget(params: {
  context: EntityPluginContext;
  pluginId: string;
}): void {
  const { context, pluginId } = params;

  context.messaging.subscribe(
    "system:plugins:ready",
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send("dashboard:register-widget", {
        id: "topics",
        pluginId,
        title: "Topics",
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
        dataProvider: async () => {
          const topics = await context.entityService.listEntities<TopicEntity>(
            "topic",
            {
              limit: 10,
              sortFields: [{ field: "updated", direction: "desc" }],
            },
          );
          return {
            items: topics.map((topic) => {
              const body = adapter.parseTopicBody(topic.content);
              const description = firstSentence(body.content);
              return {
                id: topic.id,
                name: body.title || topic.id,
                ...(description && { description }),
              };
            }),
          };
        },
      });
      return { success: true };
    },
  );
}
