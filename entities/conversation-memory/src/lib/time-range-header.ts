import { z } from "@brains/utils/zod";

/**
 * A memory's time range in its next stored form
 * (docs/plans/one-stored-form.md): two dates, startedAt and endedAt, which
 * Obsidian shows as properties, in place of the nested timeRange.
 */
export const timeRangeHeaderShape: {
  startedAt: z.ZodOptional<z.ZodISODateTime>;
  endedAt: z.ZodOptional<z.ZodISODateTime>;
} = {
  startedAt: z.iso.datetime().optional().meta({ studioWidget: "provenance" }),
  endedAt: z.iso.datetime().optional().meta({ studioWidget: "provenance" }),
};

/** A time range's header keys; none for a memory without one. */
export function timeRangeHeader(
  timeRange: { start: string; end: string } | undefined,
): Record<string, string> {
  return timeRange
    ? { startedAt: timeRange.start, endedAt: timeRange.end }
    : {};
}

/**
 * A header in either form with its time range nested, as metadata holds
 * it: startedAt and endedAt read over a nested timeRange.
 */
export function readTimeRange(
  header: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { startedAt, endedAt, ...rest } = header;
  return startedAt === undefined && endedAt === undefined
    ? rest
    : { ...rest, timeRange: { start: startedAt, end: endedAt } };
}
