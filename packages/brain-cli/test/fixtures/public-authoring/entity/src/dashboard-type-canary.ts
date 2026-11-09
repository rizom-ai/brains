import {
  defineDashboardWidget,
  defineEntity,
  z,
  type DashboardOperatorViewBlock,
  type DashboardWidgetDefinition,
  type EntityDashboardBindingContext,
  type EntityDashboardWidget,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const shelfData = z.object({
  saved: z.number().int().nonnegative(),
  tags: z.array(z.string()),
});

const shelfWidget: DashboardWidgetDefinition<
  "reading-shelf",
  typeof shelfData
> = defineDashboardWidget({
  id: "reading-shelf",
  title: "Reading shelf",
  description: "What the reader saved, and what waits for a digest.",
  group: "knowledge",
  placement: "secondary",
  priority: 30,
  permission: "trusted",
  data: shelfData,
  digest: ({ data }) => ({
    items: [{ label: "Saved", value: String(data.saved) }],
  }),
  view: ({ data }) => {
    const stats: DashboardOperatorViewBlock = {
      type: "stats",
      items: [{ label: "Saved", value: data.saved }],
    };
    return { blocks: [stats] };
  },
});

function shelf(context: EntityDashboardBindingContext): EntityDashboardWidget {
  return shelfWidget.bind(context, async ({ entities, caller, signal }) => {
    signal.throwIfAborted();
    const saved = await entities.list(bookmark);
    return {
      saved: saved.length,
      tags: caller
        ? [...new Set(saved.flatMap(({ metadata }) => metadata.tags))]
        : [],
    };
  });
}

export const readingShelf = defineEntity({
  type: "reading-shelf-widget",
  purpose: "Shows the reading shelf on the Dashboard.",
  metadata: z.object({}),
  dashboardWidgets: (context) => [shelf(context)],
});

export const invalidLoad = defineEntity({
  type: "invalid-load",
  purpose: "Compile-only rejection",
  metadata: z.object({}),
  dashboardWidgets: (context) => [
    // @ts-expect-error A loader returns the widget's own data.
    shelfWidget.bind(context, async () => ({ saved: "many" })),
  ],
});
