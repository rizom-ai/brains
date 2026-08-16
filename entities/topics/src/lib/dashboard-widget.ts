import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type EntityPluginContext,
} from "@brains/plugins";
import { firstSentence } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { TOPIC_ENTITY_TYPE, TOPICS_PLUGIN_ID } from "./constants";
import { toTopicContentProjection } from "./topic-presenter";
import type { TopicEntity } from "../schemas/topic";

const topicsWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
  ),
});

const topicsWidget = defineDashboardWidget({
  id: TOPICS_PLUGIN_ID,
  title: "Topics",
  group: "knowledge",
  placement: "secondary",
  priority: 20,
  permission: "public",
  data: topicsWidgetDataSchema,
  digest: ({ data }) => {
    const latest = data.items[0]?.name;
    return {
      items: latest
        ? [{ label: "Latest topic", value: latest }]
        : [{ label: "Topics", value: "none yet" }],
    };
  },
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "topics",
        empty: "No topics yet.",
        items: data.items.map((topic) => ({
          id: topic.id,
          title: topic.name,
          ...(topic.description ? { description: topic.description } : {}),
        })),
      },
    ],
  }),
});

export function registerTopicsDashboardWidget(params: {
  context: EntityPluginContext;
}): void {
  const { context } = params;

  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: topicsWidget,
        load: async ({ signal }) => {
          signal.throwIfAborted();
          const topics = await context.entityService.listEntities<TopicEntity>({
            entityType: TOPIC_ENTITY_TYPE,
            options: {
              limit: 10,
              sortFields: [{ field: "updated", direction: "desc" }],
            },
          });
          signal.throwIfAborted();
          return {
            items: topics.map((topic) => {
              const projected = toTopicContentProjection(topic);
              const description = firstSentence(projected.content);
              return {
                id: topic.id,
                name: projected.title || topic.id,
                ...(description ? { description } : {}),
              };
            }),
          };
        },
      });
      return { success: true };
    },
  );
}
