import {
  defineAnalyticsReport,
  type AnalyticsReportContext,
  type AnalyticsReportDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { trafficSnapshotAdapter } from "../entity/adapter";
import { trafficSnapshotSchema, type TrafficDay } from "../entity/schema";
import { addDays, datesBetween, isoWeekOf } from "../lib/iso-week";

/**
 * The owner's own pages: Studio, sign-in, the API and the operator surfaces.
 * Kept out of the top pages, which say what readers read; counted apart.
 */
const OWNER_PATH_PREFIXES = [
  "/studio",
  "/login",
  "/logout",
  "/auth",
  "/oauth",
  "/api",
  "/dashboard",
  "/mcp",
];

export interface TrafficReportsDeps {
  /** Today, `YYYY-MM-DD` in UTC, as the capture counts days. */
  today: () => string;
  /** Today's numbers so far, from Cloudflare; absent when it is not set up. */
  liveDay?: (date: string) => Promise<TrafficDay>;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const rangeShape = {
  days: z
    .number()
    .int()
    .min(1)
    .max(366)
    .default(7)
    .describe(
      "Days to cover, ending yesterday; ignored when startDate and endDate are given",
    ),
  startDate: isoDate.optional().describe("First day, YYYY-MM-DD"),
  endDate: isoDate
    .optional()
    .describe("Last day, YYYY-MM-DD; today adds today's numbers so far"),
};

function pairedRange<T extends z.ZodObject>(schema: T): T {
  return schema.refine(
    (params) =>
      (params["startDate"] === undefined) === (params["endDate"] === undefined),
    { message: "Give startDate and endDate together, or neither" },
  );
}

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

interface Range {
  startDate: string;
  endDate: string;
  days: number;
}

function rangeOf(
  params: {
    days: number;
    startDate?: string | undefined;
    endDate?: string | undefined;
  },
  today: string,
): Range {
  const endDate = params.endDate ?? addDays(today, -1);
  const startDate = params.startDate ?? addDays(endDate, -(params.days - 1));
  return { startDate, endDate, days: datesBetween(startDate, endDate).length };
}

interface DaysRead {
  byDate: Map<string, TrafficDay>;
  today: "partial" | "unavailable" | undefined;
}

/** The stored days in a range, with today's numbers so far when it reaches today. */
async function readDays(
  { entityService, visibilityScope }: AnalyticsReportContext,
  range: Pick<Range, "startDate" | "endDate">,
  deps: TrafficReportsDeps,
): Promise<DaysRead> {
  const snapshots = await entityService.listEntities(
    {
      entityType: "traffic-snapshot",
      options: { limit: 10_000, filter: { visibilityScope } },
    },
    trafficSnapshotSchema,
  );
  const byDate = new Map(
    snapshots
      .flatMap(
        (snapshot) =>
          trafficSnapshotAdapter.parseContent(snapshot.content).days,
      )
      .filter((d) => d.date >= range.startDate && d.date <= range.endDate)
      .map((d) => [d.date, d] as const),
  );
  const today = deps.today();
  if (range.startDate > today || range.endDate < today) {
    return { byDate, today: undefined };
  }
  const live = await deps.liveDay?.(today).catch(() => undefined);
  if (!live) return { byDate, today: "unavailable" };
  byDate.set(today, live);
  return { byDate, today: "partial" };
}

function isOwnerPath(path: string): boolean {
  return OWNER_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** Sums one count per key across days, largest first. */
function totals<T>(
  rows: T[],
  key: (row: T) => string,
  count: (row: T) => number,
): Array<[string, number]> {
  const summed = rows.reduce(
    (acc, row) => acc.set(key(row), (acc.get(key(row)) ?? 0) + count(row)),
    new Map<string, number>(),
  );
  return [...summed.entries()].sort((a, b) => b[1] - a[1]);
}

function sum(days: TrafficDay[], field: "pageviews" | "visits"): number {
  return days.reduce((total, d) => total + d[field], 0);
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
