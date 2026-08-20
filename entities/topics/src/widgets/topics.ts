import {
  defineDashboardWidget,
  z,
  type DashboardWidgetDefinition,
} from "@brains/sdk/entities";
import { TOPICS_PLUGIN_ID } from "../lib/constants";

type TopicsWidgetDataSchema = z.ZodObject<{
  items: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      name: z.ZodString;
      description: z.ZodOptional<z.ZodString>;
    }>
  >;
}>;

const topicsWidgetDataSchema: TopicsWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
  ),
});

export const topicsWidget: DashboardWidgetDefinition<
  "topics",
  TopicsWidgetDataSchema
> = defineDashboardWidget({
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
