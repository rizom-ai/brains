import {
  defineEntityCatalog,
  defineStudioWorkspace,
  permissionToVisibilityScope,
  registerBuiltInStudioWorkspace,
  type AnalyticsReportContext,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { shortDate } from "../lib/short-date";
import { addDays } from "../lib/iso-week";
import { readStoredDays } from "../lib/traffic-days";
import type { TrafficReports } from "../reports/traffic-reports";
import type { createTrafficByEntityReport } from "../reports/traffic-by-entity";

export interface TrafficWorkspaceReports extends TrafficReports {
  byEntity: ReturnType<typeof createTrafficByEntityReport>;
  /** Today, `YYYY-MM-DD` in UTC, as the reports count days. */
  today: () => string;
}

const RANGES = ["7", "30", "90"] as const;

/**
 * "All" in Studio's select is an empty value; the rest are day counts. Not
 * strict: Studio keeps its own keys in the query too, such as a list's offset.
 */
const querySchema = z.object({ days: z.string().optional() });

type Period = (typeof RANGES)[number] | "all";

/** Every recorded day for All, a listed range as asked, else the default. */
function periodOf(days: string | undefined): Period {
  if (days === "") return "all";
  return RANGES.find((range) => range === days) ?? "30";
}

const rangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  days: z.number(),
});

/** What the three reports return; the workspace reads nothing else. */
const overviewSchema = z.object({
  range: rangeSchema,
  pageviews: z.number(),
  visits: z.number(),
  previous: z.object({ pageviews: z.number(), visits: z.number() }),
  change: z.object({
    pageviews: z.number().nullable(),
    visits: z.number().nullable(),
  }),
  topPaths: z.array(z.object({ path: z.string(), pageviews: z.number() })),
  ownerPageviews: z.number(),
  referrers: z.array(z.object({ host: z.string(), visits: z.number() })),
  countries: z.array(z.object({ country: z.string(), visits: z.number() })),
  missingDays: z.array(z.string()),
  estimated: z.boolean(),
});

const seriesSchema = z.object({
  points: z.array(
    z.object({
      period: z.string(),
      pageviews: z.number().nullable(),
      estimated: z.boolean(),
    }),
  ),
});

const byEntitySchema = z.object({
  entities: z.array(
    z.object({
      entityType: z.string(),
      id: z.string(),
      title: z.string(),
      path: z.string(),
      publishedAt: z.string().optional(),
      pageviews: z.number(),
    }),
  ),
});

const dataSchema = z.object({
  days: z.enum([...RANGES, "all"]),
  overview: overviewSchema,
  series: seriesSchema,
  pieces: byEntitySchema,
});
type TrafficWorkspaceData = z.output<typeof dataSchema>;

const publishedWork = defineEntityCatalog({
  id: "traffic-published-work",
  label: "Published work",
});

function changeCaption(change: number | null): string {
  if (change === null) return "nothing to compare with";
  return `${change > 0 ? "+" : ""}${change}% on the period before`;
}

function busiestDay(
  points: TrafficWorkspaceData["series"]["points"],
): { label: string; pageviews: number } | undefined {
  return points.reduce<{ label: string; pageviews: number } | undefined>(
    (best, point) =>
      point.pageviews !== null && point.pageviews > (best?.pageviews ?? 0)
        ? { label: shortDate(point.period), pageviews: point.pageviews }
        : best,
    undefined,
  );
}

const trafficWorkspace = defineStudioWorkspace({
  id: "traffic",
  label: "Traffic",
  description: "What readers read, from the brain's daily traffic snapshots.",
  priority: 60,
  permission: "admin",
  entityCatalog: publishedWork,
  query: querySchema,
  data: dataSchema,
  actions: [],
  view: ({ data }) => {
    const { overview, series, pieces } = data;
    const publishedOn = new Map(
      pieces.entities.flatMap((piece) =>
        piece.publishedAt
          ? [[piece.publishedAt.slice(0, 10), piece.title] as const]
          : [],
      ),
    );
    const busiest = busiestDay(series.points);
    const read = pieces.entities.filter((piece) => piece.pageviews > 0);
    const gaps = [
      ...(overview.missingDays.length > 0
        ? [
            `${overview.missingDays.length} ${overview.missingDays.length === 1 ? "day has" : "days have"} no snapshot yet.`,
          ]
        : []),
      ...(overview.estimated
        ? ["Some days were sampled by Cloudflare; their counts are estimates."]
        : []),
    ];
    return {
      title: "Traffic",
      description: `${shortDate(overview.range.startDate)} – ${shortDate(overview.range.endDate)}`,
      blocks: [
        {
          type: "stats",
          id: "traffic-figures",
          items: [
            {
              label: "Pageviews",
              value: overview.pageviews,
              caption: changeCaption(overview.change.pageviews),
            },
            {
              label: "Visits",
              value: overview.visits,
              caption: changeCaption(overview.change.visits),
            },
            ...(busiest
              ? [
                  {
                    label: "Busiest day",
                    value: busiest.label,
                    caption: `${busiest.pageviews} pageviews`,
                  },
                ]
              : []),
            {
              label: "Your own pages",
              value: overview.ownerPageviews,
              caption: "Studio and sign-in, kept out of the lists",
            },
          ],
        },
        {
          type: "query",
          id: "traffic-range",
          controls: [
            {
              key: "days",
              label: "Period",
              value: data.days === "all" ? undefined : data.days,
              allLabel: "All recorded days",
              options: RANGES.map((days) => ({
                value: days,
                label: `Last ${days} days`,
              })),
            },
          ],
        },
        ...(gaps.length > 0
          ? [
              {
                type: "notice" as const,
                id: "traffic-gaps",
                tone: "neutral" as const,
                text: gaps.join(" "),
              },
            ]
          : []),
        {
          type: "series",
          id: "traffic-daily",
          label: "Pageviews per day",
          unit: "pageviews",
          points: series.points.map((point) => {
            const published = publishedOn.get(point.period);
            return {
              id: point.period,
              label: point.estimated
                ? `${shortDate(point.period)} (estimated)`
                : shortDate(point.period),
              value: point.pageviews,
              ...(published ? { marker: `Published: ${published}` } : {}),
            };
          }),
        },
        {
          type: "columns",
          id: "traffic-detail",
          primary: [
            {
              type: "card",
              id: "traffic-pieces-section",
              label: "Most read",
              presentation: "section",
              blocks: [
                {
                  type: "list",
                  id: "traffic-pieces",
                  empty: "No published piece was read in this period.",
                  items: read.slice(0, 10).map((piece) => ({
                    id: `${piece.entityType}:${piece.id}`,
                    title: piece.title,
                    description: piece.path,
                    count: piece.pageviews,
                    link: {
                      catalog: publishedWork,
                      entityType: piece.entityType,
                      id: piece.id,
                    },
                  })),
                },
              ],
            },
            {
              type: "card",
              id: "traffic-pages-section",
              label: "Top pages",
              presentation: "section",
              blocks: [
                {
                  type: "list",
                  id: "traffic-pages",
                  empty: "No pages read in this period.",
                  items: overview.topPaths.map((page) => ({
                    id: page.path,
                    title: page.path,
                    count: page.pageviews,
                  })),
                },
              ],
            },
          ],
          aside: [
            {
              type: "card",
              id: "traffic-referrers-section",
              label: "Referrers",
              presentation: "section",
              blocks: [
                {
                  type: "list",
                  id: "traffic-referrers",
                  empty: "No referrers in this period.",
                  items: overview.referrers.map((referrer) => ({
                    id: referrer.host,
                    title: referrer.host,
                    count: referrer.visits,
                  })),
                },
              ],
            },
            {
              type: "card",
              id: "traffic-countries-section",
              label: "Countries",
              presentation: "section",
              blocks: [
                {
                  type: "list",
                  id: "traffic-countries",
                  empty: "No countries in this period.",
                  items: overview.countries.map((country) => ({
                    id: country.country,
                    title: country.country,
                    count: country.visits,
                  })),
                },
              ],
            },
          ],
        },
      ],
    };
  },
});

/** A period as report params: all means the first stored day to yesterday. */
async function rangeFor(
  period: Period,
  context: AnalyticsReportContext,
  today: () => string,
): Promise<{ days: number } | { startDate: string; endDate: string }> {
  if (period !== "all") return { days: Number(period) };
  const endDate = addDays(today(), -1);
  const first = (await readStoredDays(context))
    .map((d) => d.date)
    .reduce<string | undefined>(
      (earliest, date) =>
        earliest === undefined || date < earliest ? date : earliest,
      undefined,
    );
  return first !== undefined && first <= endDate
    ? { startDate: first, endDate }
    : { days: 30 };
}

/** Registers the Traffic workspace; a no-op where Studio does not run. */
export async function registerTrafficWorkspace(
  context: ServicePluginContext,
  reports: TrafficWorkspaceReports,
): Promise<string | undefined> {
  const result = await registerBuiltInStudioWorkspace({
    context,
    definition: trafficWorkspace,
    bind: (bindingContext) =>
      trafficWorkspace.bind(bindingContext, {
        listEntityTypes: () => Object.keys(context.entityDisplay ?? {}),
        load: async ({ caller, query }) => {
          if (!caller) throw new Error("Traffic requires authentication");
          const days = periodOf(query.get(querySchema).days);
          const reportContext = {
            entityService: context.entityService,
            visibilityScope: permissionToVisibilityScope(caller.permission),
          };
          const range = await rangeFor(days, reportContext, reports.today);
          const [overview, series, pieces] = await Promise.all([
            reports.overview.handler(
              reports.overview.params.parse({ ...range, limit: 10 }),
              reportContext,
            ),
            reports.series.handler(
              reports.series.params.parse({ ...range, interval: "day" }),
              reportContext,
            ),
            reports.byEntity.handler(
              reports.byEntity.params.parse({ ...range, limit: 100 }),
              reportContext,
            ),
          ]);
          return {
            days,
            overview: overviewSchema.parse(overview),
            series: seriesSchema.parse(series),
            pieces: byEntitySchema.parse(pieces),
          };
        },
        actions: [],
      }),
  });
  return result === false ? undefined : result.workspaceUrl;
}
