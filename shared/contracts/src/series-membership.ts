import { z } from "@brains/utils/zod";

/** Any entity, as far as its series membership is concerned. */
interface SeriesSource {
  readonly metadata: unknown;
}

/** A series member, as far as its place in the series is concerned. */
interface SeriesMember extends SeriesSource {
  readonly created: string;
}

/**
 * Helpers for reading the series group any entity type may carry in its
 * metadata. Centralized so the data source and the projection agree on how
 * membership and order are read, and so they are read through zod rather
 * than unchecked casts.
 *
 * A member names its series with the one value of its `series` group. Its
 * place in the series is not stored: it is when the member was published,
 * and for a draft when it was made.
 */
const seriesSourceMetadataSchema: z.ZodObject<{
  series: z.ZodOptional<z.ZodArray<z.ZodString>>;
  publishedAt: z.ZodOptional<z.ZodString>;
}> = z.object({
  series: z.array(z.string()).optional(),
  publishedAt: z.string().optional(),
});

export type SeriesSourceFields = z.output<typeof seriesSourceMetadataSchema>;

/** Parse the series fields out of a raw metadata object (or event payload). */
export function parseSeriesFields(metadata: unknown): SeriesSourceFields {
  const result = seriesSourceMetadataSchema.safeParse(metadata);
  return result.success ? result.data : {};
}

/** The series an entity belongs to: its one `series` value, if it names one. */
export function getSeriesName(entity: SeriesSource): string | undefined {
  const name = parseSeriesFields(entity.metadata).series?.[0]?.trim();
  return name === "" ? undefined : name;
}

/**
 * Order two members of a series: published ones by when they were published,
 * then drafts by when they were made, so a series reads in the order it was
 * written without a stored number to keep in step.
 */
export function compareBySeriesPosition(
  a: SeriesMember,
  b: SeriesMember,
): number {
  const published = (member: SeriesMember): string | undefined =>
    parseSeriesFields(member.metadata).publishedAt;
  const ap = published(a);
  const bp = published(b);
  if (ap && bp)
    return ap.localeCompare(bp) || a.created.localeCompare(b.created);
  if (ap) return -1;
  if (bp) return 1;
  return a.created.localeCompare(b.created);
}
