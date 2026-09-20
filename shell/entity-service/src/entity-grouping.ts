import { z } from "@brains/utils/zod";
import type { ContentVisibility } from "./visibility";

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

export interface QueryGroupingCatalogRequest {
  grouping: string;
  /** Required caller-admitted set; it can only narrow the declared types. */
  entityTypes: string[];
  visibilityScope?: ContentVisibility | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  signal?: AbortSignal | undefined;
}
export interface QueryGroupingMembersRequest extends QueryGroupingCatalogRequest {
  value: string;
  q?: string | undefined;
  sort?:
    "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | undefined;
}
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
