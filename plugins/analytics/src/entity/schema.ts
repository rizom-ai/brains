import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

const isoDate: z.ZodString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count: z.ZodNumber = z.number().int().nonnegative();

type TrafficDaySchema = z.ZodObject<{
  date: z.ZodString;
  pageviews: z.ZodNumber;
  visits: z.ZodNumber;
  estimated: z.ZodBoolean;
  paths: z.ZodArray<z.ZodObject<{ path: z.ZodString; pageviews: z.ZodNumber }>>;
  referrers: z.ZodArray<
    z.ZodObject<{ host: z.ZodString; visits: z.ZodNumber }>
  >;
  pathReferrers: z.ZodArray<
    z.ZodObject<{ path: z.ZodString; host: z.ZodString; visits: z.ZodNumber }>
  >;
  countries: z.ZodArray<
    z.ZodObject<{ country: z.ZodString; visits: z.ZodNumber }>
  >;
}>;

/**
 * One day of traffic. `estimated` marks a day Cloudflare had already sampled
 * when it was read, so its counts are scaled up from a sample.
 */
export const trafficDaySchema: TrafficDaySchema = z.object({
  date: isoDate,
  pageviews: count,
  visits: count,
  estimated: z.boolean(),
  paths: z.array(z.object({ path: z.string(), pageviews: count })),
  referrers: z.array(z.object({ host: z.string(), visits: count })),
  pathReferrers: z.array(
    z.object({ path: z.string(), host: z.string(), visits: count }),
  ),
  countries: z.array(z.object({ country: z.string(), visits: count })),
});
export type TrafficDay = z.output<typeof trafficDaySchema>;

type TrafficSnapshotFrontmatterSchema = z.ZodObject<{
  week: z.ZodString;
  start: z.ZodString;
  end: z.ZodString;
  days: z.ZodArray<TrafficDaySchema>;
}>;

/** A week of traffic, Monday to Sunday, keyed by its ISO week. */
export const trafficSnapshotFrontmatterSchema: TrafficSnapshotFrontmatterSchema =
  z.object({
    week: z.string().regex(/^\d{4}-W\d{2}$/),
    start: isoDate,
    end: isoDate,
    days: z.array(trafficDaySchema),
  });
export type TrafficSnapshotFrontmatter = z.output<
  typeof trafficSnapshotFrontmatterSchema
>;

type TrafficSnapshotMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  week: z.ZodString;
  start: z.ZodString;
  end: z.ZodString;
  pageviews: z.ZodNumber;
  visits: z.ZodNumber;
}>;

export const trafficSnapshotMetadataSchema: TrafficSnapshotMetadataSchema =
  z.object({
    title: z.string(),
    week: z.string(),
    start: isoDate,
    end: isoDate,
    pageviews: count,
    visits: count,
  });
export type TrafficSnapshotMetadata = z.output<
  typeof trafficSnapshotMetadataSchema
>;

export const trafficSnapshotSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"traffic-snapshot">;
    visibility: z.ZodLiteral<"restricted">;
    metadata: TrafficSnapshotMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("traffic-snapshot"),
  visibility: z.literal("restricted"),
  metadata: trafficSnapshotMetadataSchema,
});
export type TrafficSnapshot = z.output<typeof trafficSnapshotSchema>;
