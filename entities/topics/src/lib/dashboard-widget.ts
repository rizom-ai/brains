import { defineDashboardWidget } from "@brains/sdk/services";
import type { ServiceRuntime } from "@brains/sdk/internal/service-runtime";
import { firstSentence } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { TOPIC_ENTITY_TYPE, TOPICS_PLUGIN_ID } from "./constants";
import { toTopicContentProjection } from "./topic-presenter";
import { topicEntitySchema } from "../schemas/topic";

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

/**
 * The topic list on the Dashboard, as the class's built-in widget drew it:
 * the ten most recently updated topics the viewer may read, registered once
 * every plugin has registered.
 */
export function registerTopicsDashboardWidget(
  runtime: Pick<ServiceRuntime, "dashboardWidget">,
): void {
  runtime.dashboardWidget({
    definition: topicsWidget,
    load: async ({ corpus, visibilityScope, signal }) => {
      signal.throwIfAborted();
      const topics = (
        await corpus.listEntities({
          entityType: TOPIC_ENTITY_TYPE,
          options: {
            limit: 10,
            sortFields: [{ field: "updated", direction: "desc" }],
            filter: { visibilityScope },
          },
        })
      ).map((topic) => topicEntitySchema.parse(topic));
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
}
