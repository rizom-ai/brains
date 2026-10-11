import {
  defineAnalyticsReport,
  type AnalyticsReportDefinition,
} from "@brains/plugins";
import {
  EntityUrlGenerator,
  type EntityDisplayEntry,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import type { TrafficDay } from "../entity/schema";
import { addDays } from "../lib/iso-week";
import {
  pairedRange,
  rangeOf,
  rangeShape,
  readDays,
  readStoredDays,
  totals,
  type TrafficReportsDeps,
} from "../lib/traffic-days";

export interface TrafficByEntityDeps extends TrafficReportsDeps {
  /** The site's entity display: which types have pages, and where. */
  entityDisplay: Record<string, EntityDisplayEntry> | undefined;
}

const byEntityParams: z.ZodObject<{
  days: z.ZodDefault<z.ZodNumber>;
  startDate: z.ZodOptional<z.ZodString>;
  endDate: z.ZodOptional<z.ZodString>;
  entityType: z.ZodOptional<z.ZodString>;
  limit: z.ZodDefault<z.ZodNumber>;
  firstDays: z.ZodOptional<z.ZodNumber>;
}> = pairedRange(
  z.object({
    ...rangeShape,
    entityType: z
      .string()
      .optional()
      .describe("Only this entity type, e.g. post or deck"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe("Entities to return, busiest first"),
    firstDays: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe(
        "Also count each piece's views in its first N days after publishing",
      ),
  }),
);

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A piece's views in its first `days` days, counted from its publish date. */
function firstDaysOf(
  stored: TrafficDay[],
  path: string,
  publishedOn: string,
  days: number,
): { days: number; startDate: string; endDate: string; pageviews: number } {
  const endDate = addDays(publishedOn, days - 1);
  const window = stored.filter(
    (d) => d.date >= publishedOn && d.date <= endDate,
  );
  return {
    days,
    startDate: publishedOn,
    endDate,
    pageviews: pageviewsOn(window, path),
  };
}

function pageviewsOn(days: TrafficDay[], path: string): number {
  return days
    .flatMap((d) => d.paths)
    .filter((p) => p.path === path)
    .reduce((total, p) => total + p.pageviews, 0);
}

export function createTrafficByEntityReport(
  deps: TrafficByEntityDeps,
): AnalyticsReportDefinition<typeof byEntityParams> {
  const urls = new EntityUrlGenerator(deps.entityDisplay);
  const routedTypes = Object.keys(deps.entityDisplay ?? {});

  return defineAnalyticsReport({
    type: "traffic-by-entity",
    description:
      "Pageviews per published piece (posts, decks and other types with pages) from the brain's daily snapshots, busiest first, with each piece's top referrers. For how a piece did after it was published (its first week, its launch), set firstDays, e.g. 7, rather than choosing dates: the window starts on its publish date.",
    params: byEntityParams,
    minVisibility: "admin",
    handler: async (params, context) => {
      const types = params.entityType ? [params.entityType] : routedTypes;
      const unrouted = types.filter((type) => !urls.hasRoute(type));
      if (unrouted.length > 0) {
        throw new Error(
          `The site has no pages for ${unrouted.join(", ")}. Types with pages: ${routedTypes.join(", ") || "none"}`,
        );
      }
      const range = rangeOf(params, deps.today());
      const stored = await readStoredDays(context);
      const { byDate, today } = await readDays(context, range, deps, stored);
      const days = [...byDate.values()];

      // Pages are public: the pieces a reader can open are public and published.
      const pieces = (
        await Promise.all(
          types.map((entityType) =>
            context.entityService.listEntities({
              entityType,
              options: {
                limit: 10_000,
                publishedOnly: true,
                filter: { visibilityScope: "public" },
              },
            }),
          ),
        )
      ).flat();

      const entities = pieces
        .map((piece) => {
          const slug = metadataString(piece.metadata, "slug") ?? piece.id;
          const path = urls.generateUrl(piece.entityType, slug);
          const publishedAt = metadataString(piece.metadata, "publishedAt");
          const firstDays =
            params.firstDays !== undefined && publishedAt
              ? firstDaysOf(
                  stored,
                  path,
                  publishedAt.slice(0, 10),
                  params.firstDays,
                )
              : undefined;
          return {
            entityType: piece.entityType,
            id: piece.id,
            title: metadataString(piece.metadata, "title") ?? piece.id,
            path,
            ...(publishedAt ? { publishedAt } : {}),
            pageviews: pageviewsOn(days, path),
            referrers: totals(
              days
                .flatMap((d) => d.pathReferrers)
                .filter((r) => r.path === path),
              (r) => r.host,
              (r) => r.visits,
            )
              .slice(0, 3)
              .map(([host, visits]) => ({ host, visits })),
            ...(firstDays ? { firstDays } : {}),
          };
        })
        .sort((a, b) => b.pageviews - a.pageviews)
        .slice(0, params.limit);

      return {
        range,
        entities,
        note: "Counts come from each day's top 25 pages, so a quiet page can read low.",
        ...(today ? { today } : {}),
      };
    },
  });
}
