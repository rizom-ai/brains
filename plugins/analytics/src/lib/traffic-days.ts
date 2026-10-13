import type { AnalyticsReportContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { trafficSnapshotAdapter } from "../entity/adapter";
import { trafficSnapshotSchema, type TrafficDay } from "../entity/schema";
import { addDays, datesBetween } from "./iso-week";

export interface TrafficReportsDeps {
  /** Today, `YYYY-MM-DD` in UTC, as the capture counts days. */
  today: () => string;
  /** Today's numbers so far, from Cloudflare; absent when it is not set up. */
  liveDay?: (date: string) => Promise<TrafficDay>;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** The range params every traffic report takes. */
export const rangeShape: {
  days: z.ZodDefault<z.ZodNumber>;
  startDate: z.ZodOptional<z.ZodString>;
  endDate: z.ZodOptional<z.ZodString>;
} = {
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

/** A date range only as a pair. */
export function pairedRange<T extends z.ZodObject>(schema: T): T {
  return schema.refine(
    (params) =>
      (params["startDate"] === undefined) === (params["endDate"] === undefined),
    { message: "Give startDate and endDate together, or neither" },
  );
}

export interface Range {
  startDate: string;
  endDate: string;
  days: number;
}

/** The days a report covers: the last `days` ending yesterday, or the pair. */
export function rangeOf(
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

export interface DaysRead {
  byDate: Map<string, TrafficDay>;
  today: "partial" | "unavailable" | undefined;
}

/** Every day the brain's snapshots hold. */
export async function readStoredDays({
  entityService,
  visibilityScope,
}: AnalyticsReportContext): Promise<TrafficDay[]> {
  const snapshots = await entityService.listEntities(
    {
      entityType: "traffic-snapshot",
      options: { limit: 10_000, filter: { visibilityScope } },
    },
    trafficSnapshotSchema,
  );
  return snapshots.flatMap(
    (snapshot) => trafficSnapshotAdapter.parseContent(snapshot.content).days,
  );
}

/**
 * The stored days in a range, with today's numbers so far when it reaches
 * today. Pass `stored` when the report has read them already.
 */
export async function readDays(
  context: AnalyticsReportContext,
  range: Pick<Range, "startDate" | "endDate">,
  deps: TrafficReportsDeps,
  stored?: TrafficDay[],
): Promise<DaysRead> {
  const days = stored ?? (await readStoredDays(context));
  const byDate = new Map(
    days
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

/** Sums one count per key across days, largest first. */
export function totals<T>(
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

/** One field summed over days. */
export function sum(days: TrafficDay[], field: "pageviews" | "visits"): number {
  return days.reduce((total, d) => total + d[field], 0);
}
