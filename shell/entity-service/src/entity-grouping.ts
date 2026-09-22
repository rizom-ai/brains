import { z } from "@brains/utils/zod";
import { canonicalContentVisibilitySchema } from "./visibility";

export const entityGroupingSchema: z.ZodObject<{
  key: z.ZodString;
  label: z.ZodString;
  field: z.ZodString;
  types: z.ZodArray<z.ZodString>;
}> = z.strictObject({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().trim().min(1).max(100),
  field: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/),
  types: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(100)
    .refine(
      (types) => new Set(types).size === types.length,
      "Grouping types must be unique",
    ),
});
export type EntityGrouping = z.infer<typeof entityGroupingSchema>;

/** One ordering vocabulary, shared by the queries, the routes and the UI. */
export const groupingSortSchema: z.ZodEnum<{
  "updated-desc": "updated-desc";
  "updated-asc": "updated-asc";
  "created-desc": "created-desc";
  "created-asc": "created-asc";
}> = z.enum(["updated-desc", "updated-asc", "created-desc", "created-asc"]);
export type GroupingSort = z.infer<typeof groupingSortSchema>;

export const GROUPING_PAGE_LIMIT = 50;
export const GROUPING_MAX_PAGE_LIMIT = 100;
/** Bounds every grouping read, whoever builds the request. */
export const groupingKeySchema: z.ZodString = z.string().min(1).max(80);
export const groupingValueSchema: z.ZodString = z.string().max(10000);
export const groupingSearchSchema: z.ZodString = z.string().max(200);

export const queryGroupingCatalogSchema: z.ZodObject<{
  grouping: z.ZodString;
  entityTypes: z.ZodArray<z.ZodString>;
  visibilityScope: z.ZodOptional<typeof canonicalContentVisibilitySchema>;
  limit: z.ZodDefault<z.ZodNumber>;
  offset: z.ZodDefault<z.ZodNumber>;
  signal: z.ZodOptional<z.ZodCustom<AbortSignal, AbortSignal>>;
}> = z.object({
  grouping: groupingKeySchema,
  /** Required caller-admitted set; it can only narrow the declared types. */
  entityTypes: z.array(z.string().min(1)).max(100),
  visibilityScope: canonicalContentVisibilitySchema.optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(GROUPING_MAX_PAGE_LIMIT)
    .default(GROUPING_PAGE_LIMIT),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  signal: z.instanceof(AbortSignal).optional(),
});

export const queryGroupingMembersSchema: z.ZodObject<{
  grouping: z.ZodString;
  entityTypes: z.ZodArray<z.ZodString>;
  visibilityScope: z.ZodOptional<typeof canonicalContentVisibilitySchema>;
  limit: z.ZodDefault<z.ZodNumber>;
  offset: z.ZodDefault<z.ZodNumber>;
  signal: z.ZodOptional<z.ZodCustom<AbortSignal, AbortSignal>>;
  value: z.ZodString;
  q: z.ZodOptional<z.ZodString>;
  sort: z.ZodDefault<typeof groupingSortSchema>;
}> = queryGroupingCatalogSchema.extend({
  value: groupingValueSchema,
  q: groupingSearchSchema.optional(),
  sort: groupingSortSchema.default("updated-desc"),
});

export type QueryGroupingCatalogRequest = z.input<
  typeof queryGroupingCatalogSchema
>;
export type QueryGroupingMembersRequest = z.input<
  typeof queryGroupingMembersSchema
>;

export interface EntityGroupingCatalog {
  values: Array<{ value: string; count: number }>;
  total: number;
}
export const GROUPING_RESERVED_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "entityType",
  "entity-type",
  "content",
  "contentHash",
  "content-hash",
  "created",
  "updated",
  "visibility",
  "metadata",
  "__proto__",
  "constructor",
  "prototype",
]);
