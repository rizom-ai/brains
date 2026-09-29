import { defineDashboardWidget, z } from "@brains/sdk/entities";
import type { DashboardWidgetDefinition } from "@brains/sdk/entities";
import { wishPrioritySchema, wishStatusSchema } from "../schemas/wish";

type WishWidgetDataSchema = z.ZodObject<{
  items: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      name: z.ZodString;
      count: z.ZodNumber;
      priority: typeof wishPrioritySchema;
      status: typeof wishStatusSchema;
    }>
  >;
}>;

const wishWidgetDataSchema: WishWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      count: z.number().int().nonnegative(),
      priority: wishPrioritySchema,
      status: wishStatusSchema,
    }),
  ),
});

function priorityTone(
  priority: z.output<typeof wishPrioritySchema>,
): "error" | "warn" | "neutral" {
  if (priority === "critical") return "error";
  if (priority === "high") return "warn";
  return "neutral";
}

export const topWishesWidget: DashboardWidgetDefinition<
  "top-wishes",
  WishWidgetDataSchema
> = defineDashboardWidget({
  id: "top-wishes",
  title: "Top Wishes",
  group: "knowledge",
  placement: "secondary",
  priority: 30,
  permission: "public",
  data: wishWidgetDataSchema,
  digest: ({ data }) => {
    const top = data.items[0];
    return {
      items: top
        ? [{ label: "Top wish", value: `${top.name} · ×${top.count}` }]
        : [{ label: "Wishes", value: "none yet" }],
    };
  },
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "wishes",
        empty: "No wishes yet.",
        items: data.items.map((wish) => ({
          id: wish.id,
          title: wish.name,
          count: wish.count,
          badges: [
            { label: wish.priority, tone: priorityTone(wish.priority) },
            {
              label: wish.status,
              tone: wish.status === "done" ? "good" : "neutral",
            },
          ],
        })),
      },
    ],
  }),
});
