import type { EntityPluginContext } from "@brains/plugins";
import { TOPIC_ENTITY_TYPE, TOPICS_PLUGIN_ID } from "./constants";
import { toTopicContentProjection } from "./topic-presenter";
import type { TopicEntity } from "../schemas/topic";

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
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: TOPICS_PLUGIN_ID,
          pluginId,
          title: "Topics",
          section: "secondary",
          priority: 20,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const topics =
              await context.entityService.listEntities<TopicEntity>({
                entityType: TOPIC_ENTITY_TYPE,
                options: {
                  limit: 10,
                  sortFields: [{ field: "updated", direction: "desc" }],
                },
              });
            return {
              items: topics.map((topic) => {
                const projected = toTopicContentProjection(topic);
                const description = firstSentence(projected.content);
                return {
                  id: topic.id,
                  name: projected.title || topic.id,
                  ...(description && { description }),
                };
              }),
            };
          },
        },
      });
      return { success: true };
    },
  );
}
