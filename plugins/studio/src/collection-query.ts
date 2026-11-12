import { z } from "@brains/utils/zod";
import { STUDIO_ENTITY_PAGE_LIMIT } from "./editor-contracts";

export const studioCollectionQuerySchema: z.ZodObject<{
  prefix: z.ZodDefault<z.ZodNullable<z.ZodTuple<[z.ZodString], z.ZodString>>>;
  scope: z.ZodDefault<
    z.ZodEnum<{ folder: "folder"; collection: "collection" }>
  >;
  q: z.ZodDefault<z.ZodString>;
  visibility: z.ZodDefault<
    z.ZodEnum<{
      all: "all";
      public: "public";
      shared: "shared";
      restricted: "restricted";
    }>
  >;
  status: z.ZodDefault<z.ZodString>;
  sort: z.ZodDefault<
    z.ZodEnum<{
      "updated-desc": "updated-desc";
      "updated-asc": "updated-asc";
      "created-desc": "created-desc";
      "created-asc": "created-asc";
    }>
  >;
  offset: z.ZodDefault<z.ZodCoercedNumber>;
  limit: z.ZodDefault<z.ZodCoercedNumber>;
}> = z.object({
  prefix: z.tuple([z.string()], z.string()).nullable().default(null),
  scope: z.enum(["folder", "collection"]).default("folder"),
  q: z.string().trim().max(200).default(""),
  visibility: z.enum(["all", "public", "shared", "restricted"]).default("all"),
  status: z.string().trim().max(100).default(""),
  sort: z
    .enum(["updated-desc", "updated-asc", "created-desc", "created-asc"])
    .default("updated-desc"),
  offset: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(STUDIO_ENTITY_PAGE_LIMIT),
});

export function studioCollectionQueryFromParams(
  params: URLSearchParams,
): unknown {
  const rawPrefix = params.get("prefix");
  let prefix: unknown = null;
  if (rawPrefix !== null) {
    try {
      prefix = JSON.parse(rawPrefix);
    } catch {
      prefix = rawPrefix;
    } // Preserve invalid input for the transport schema to reject.
  }
  return {
    prefix,
    scope: params.get("scope") ?? undefined,
    q: params.get("q") ?? undefined,
    visibility: params.get("visibility") ?? undefined,
    status: params.get("status") ?? undefined,
    sort: params.get("sort") ?? undefined,
    offset: params.get("offset") ?? undefined,
    limit: params.get("limit") ?? undefined,
  };
}

export type StudioCollectionQuery = z.output<
  typeof studioCollectionQuerySchema
>;
