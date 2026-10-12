import {
  defineAnalyticsReport,
  type AnalyticsReportDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { addDays, datesBetween, isoWeekOf } from "../lib/iso-week";
import {
  pairedRange,
  rangeOf,
  rangeShape,
  readDays,
  sum,
  totals,
  type TrafficReportsDeps,
} from "../lib/traffic-days";

/**
 * The owner's own pages: Studio, sign-in, the API and the operator surfaces.
 * Kept out of the top pages, which say what readers read; counted apart.
 */
const OWNER_PATH_PREFIXES = [
  "/studio",
  // Studio's path before it was renamed; old links and bookmarks still use it.
  "/cms",
  "/login",
  "/logout",
  "/auth",
  "/oauth",
  "/api",
  "/dashboard",
  "/mcp",
];

const overviewParams: z.ZodObject<{
  days: z.ZodDefault<z.ZodNumber>;
  startDate: z.ZodOptional<z.ZodString>;
  endDate: z.ZodOptional<z.ZodString>;
  limit: z.ZodDefault<z.ZodNumber>;
}> = pairedRange(
  z.object({
    ...rangeShape,
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(10)
      .describe("Entries in each top list"),
  }),
);

const seriesParams: z.ZodObject<{
  days: z.ZodDefault<z.ZodNumber>;
  startDate: z.ZodOptional<z.ZodString>;
  endDate: z.ZodOptional<z.ZodString>;
  interval: z.ZodDefault<z.ZodEnum<{ day: "day"; week: "week" }>>;
}> = pairedRange(
  z.object({
    ...rangeShape,
    interval: z
      .enum(["day", "week"])
      .default("day")
      .describe("One point per day, or per ISO week"),
  }),
);

function isOwnerPath(path: string): boolean {
  return OWNER_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** Percent change, rounded; none against an empty period. */
function change(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 100);
}

export interface TrafficReports {
  overview: AnalyticsReportDefinition<typeof overviewParams>;
  series: AnalyticsReportDefinition<typeof seriesParams>;
}

export function createTrafficReports(deps: TrafficReportsDeps): TrafficReports {
  const overview = defineAnalyticsReport({
    type: "traffic-overview",
    description:
      "Site traffic over a period from the brain's daily snapshots: pageviews and visits against the period before, top pages (the owner's own pages counted apart), referrers and countries.",
    params: overviewParams,
    // Traffic is operational data, kept in restricted snapshots.
    minVisibility: "admin",
    handler: async (params, context) => {
      const range = rangeOf(params, deps.today());
      const previousEnd = addDays(range.startDate, -1);
      const previousStart = addDays(previousEnd, -(range.days - 1));
      const [current, before] = await Promise.all([
        readDays(context, range, deps),
        readDays(
          context,
          { startDate: previousStart, endDate: previousEnd },
          deps,
        ),
      ]);
      const days = [...current.byDate.values()];
      const previousDays = [...before.byDate.values()];
      const paths = days.flatMap((d) => d.paths);
      const ownerPageviews = paths
        .filter((p) => isOwnerPath(p.path))
        .reduce((total, p) => total + p.pageviews, 0);
      const pageviews = sum(days, "pageviews");
      const visits = sum(days, "visits");
      const previousPageviews = sum(previousDays, "pageviews");
      const previousVisits = sum(previousDays, "visits");
      return {
        range,
        pageviews,
        visits,
        previous: {
          startDate: previousStart,
          endDate: previousEnd,
          pageviews: previousPageviews,
          visits: previousVisits,
        },
        change: {
          pageviews: change(pageviews, previousPageviews),
          visits: change(visits, previousVisits),
        },
        topPaths: totals(
          paths.filter((p) => !isOwnerPath(p.path)),
          (p) => p.path,
          (p) => p.pageviews,
        )
          .slice(0, params.limit)
          .map(([path, count]) => ({ path, pageviews: count })),
        ownerPageviews,
        referrers: totals(
          days.flatMap((d) => d.referrers),
          (r) => r.host,
          (r) => r.visits,
        )
          .slice(0, params.limit)
          .map(([host, count]) => ({ host, visits: count })),
        countries: totals(
          days.flatMap((d) => d.countries),
          (c) => c.country,
          (c) => c.visits,
        )
          .slice(0, params.limit)
          .map(([country, count]) => ({ country, visits: count })),
        missingDays: datesBetween(range.startDate, range.endDate).filter(
          (date) => !current.byDate.has(date),
        ),
        // Cloudflare samples days older than about a week; their counts are estimates.
        estimated: days.some((d) => d.estimated),
        ...(current.today ? { today: current.today } : {}),
      };
    },
  });

  const series = defineAnalyticsReport({
    type: "traffic-series",
    description:
      "Pageviews and visits per day or per ISO week from the brain's daily snapshots, for trends and charts.",
    params: seriesParams,
    minVisibility: "admin",
    handler: async (params, context) => {
      const range = rangeOf(params, deps.today());
      const read = await readDays(context, range, deps);
      const dates = datesBetween(range.startDate, range.endDate);
      const points =
        params.interval === "day"
          ? dates.map((date) => {
              const d = read.byDate.get(date);
              return {
                period: date,
                pageviews: d?.pageviews ?? null,
                visits: d?.visits ?? null,
                estimated: d?.estimated ?? false,
              };
            })
          : [
              ...dates
                .reduce((weeks, date) => {
                  const id = isoWeekOf(date).id;
                  return weeks.set(id, [...(weeks.get(id) ?? []), date]);
                }, new Map<string, string[]>())
                .entries(),
            ].map(([week, weekDates]) => {
              const stored = weekDates.flatMap((date) => {
                const d = read.byDate.get(date);
                return d ? [d] : [];
              });
              return {
                period: week,
                pageviews: sum(stored, "pageviews"),
                visits: sum(stored, "visits"),
                days: stored.length,
                estimated: stored.some((d) => d.estimated),
              };
            });
      return {
        interval: params.interval,
        range,
        points,
        ...(read.today ? { today: read.today } : {}),
      };
    },
  });

  return { overview, series };
}
export type { TrafficReportsDeps } from "../lib/traffic-days";
