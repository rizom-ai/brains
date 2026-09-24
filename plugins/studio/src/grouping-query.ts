import { z } from "@brains/utils/zod";
import type { StudioCollectionQuery } from "./collection-query";

// Browser URL state, not query authority: the caller-bound runtime validates
// these bounds independently. Do not import a server SDK entry into the UI.
const GROUPING_PAGE_LIMIT = 50;
const GROUPING_MAX_PAGE_LIMIT = 100;
const groupingSearchSchema: z.ZodString = z.string().max(200);
const groupingValueSchema: z.ZodString = z.string().max(10000);
const groupingSortSchema: z.ZodType<StudioCollectionQuery["sort"]> = z.enum([
  "updated-desc",
  "updated-asc",
  "created-desc",
  "created-asc",
]);

/**
 * The URL-facing grouping query. Entity-service owns the vocabulary; this adds
 * only the browser's own state: a selected value, a type filter and paging.
 * The schema is the contract, so the type is read off it rather than restated.
 */
const schema: z.ZodObject<{
  value: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  type: z.ZodDefault<z.ZodString>;
  q: z.ZodDefault<z.ZodString>;
  sort: z.ZodDefault<typeof groupingSortSchema>;
  offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
  limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}> = z.object({
  value: groupingValueSchema.nullable().default(null),
  type: z.string().max(100).default(""),
  q: groupingSearchSchema.trim().default(""),
  sort: groupingSortSchema.default("updated-desc"),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(GROUPING_MAX_PAGE_LIMIT)
    .default(GROUPING_PAGE_LIMIT),
});

export type StudioGroupingQuery = z.output<typeof schema>;
export const studioGroupingQuerySchema: z.ZodType<
  StudioGroupingQuery,
  unknown
> = schema;
export { GROUPING_PAGE_LIMIT };
