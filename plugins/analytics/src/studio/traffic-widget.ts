import {
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { shortDate } from "../lib/short-date";
import type { TrafficReports } from "../reports/traffic-reports";

const WEEK = 7;

/** The part of the overview and series reports the widget shows. */
const dataSchema = z.object({
  pageviews: z.number(),
  visits: z.number(),
  change: z.object({
    pageviews: z.number().nullable(),
    visits: z.number().nullable(),
  }),
  points: z.array(
    z.object({ period: z.string(), pageviews: z.number().nullable() }),
  ),
});

function withChange(value: number, change: number | null): string {
  return change === null
    ? String(value)
    : `${value} · ${change > 0 ? "+" : ""}${change}%`;
}

const trafficWidget = defineDashboardWidget({
  id: "traffic",
  title: "Traffic",
  group: "publishing",
  placement: "secondary",
  priority: 40,
  permission: "admin",
  data: dataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "Pageviews, 7 days",
        value: withChange(data.pageviews, data.change.pageviews),
      },
    ],
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "stats",
        items: [
          {
            label: "Pageviews",
            value: data.pageviews,
            caption: withChange(data.pageviews, data.change.pageviews),
          },
          {
            label: "Visits",
            value: data.visits,
            caption: withChange(data.visits, data.change.visits),
          },
        ],
      },
      {
        type: "series",
        id: "traffic-week",
        label: "Pageviews, last 7 days",
        unit: "pageviews",
        points: data.points.map((point) => ({
          id: point.period,
          label: shortDate(point.period),
          value: point.pageviews,
        })),
      },
      {
        type: "links",
        items: [
          { label: "Open Traffic", target: { launch: { target: "traffic" } } },
        ],
      },
    ],
  }),
});

/** Registers the Traffic widget; a no-op where the dashboard does not run. */
export async function registerTrafficWidget(
  context: ServicePluginContext,
  reports: TrafficReports,
): Promise<boolean> {
  return registerBuiltInDashboardWidget({
    context,
    definition: trafficWidget,
    load: async ({ visibilityScope, signal }) => {
      signal.throwIfAborted();
      const reportContext = {
        entityService: context.entityService,
        visibilityScope,
      };
      const [overview, series] = await Promise.all([
        reports.overview.handler(
          reports.overview.params.parse({ days: WEEK, limit: 1 }),
          reportContext,
        ),
        reports.series.handler(
          reports.series.params.parse({ days: WEEK, interval: "day" }),
          reportContext,
        ),
      ]);
      return dataSchema.parse({ ...overview, ...series });
    },
  });
}
