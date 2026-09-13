import { z } from "@brains/utils/zod";
import { STUDIO_ENTITY_PAGE_LIMIT } from "./editor-contracts";

export interface StudioCollectionQuery {
  q: string;
  visibility: "all" | "public" | "shared" | "restricted";
  status: string;
  sort: "updated-desc" | "updated-asc" | "created-desc" | "created-asc";
  offset: number;
  limit: number;
}

export const studioCollectionQuerySchema: z.ZodType<StudioCollectionQuery> =
  z.object({
    q: z.string().trim().max(200).default(""),
    visibility: z
      .enum(["all", "public", "shared", "restricted"])
      .default("all"),
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
  return {
    q: params.get("q") ?? undefined,
    visibility: params.get("visibility") ?? undefined,
    status: params.get("status") ?? undefined,
    sort: params.get("sort") ?? undefined,
    offset: params.get("offset") ?? undefined,
    limit: params.get("limit") ?? undefined,
  };
}
