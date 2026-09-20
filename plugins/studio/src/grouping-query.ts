import { z } from "@brains/utils/zod";

export interface StudioGroupingQuery {
  value: string | null;
  type: string;
  q: string;
  sort: "updated-desc" | "updated-asc" | "created-desc" | "created-asc";
  offset: number;
  limit: number;
}
export const studioGroupingQuerySchema: z.ZodType<StudioGroupingQuery> =
  z.object({
    value: z.string().max(10000).nullable().default(null),
    type: z.string().max(100).default(""),
    q: z.string().trim().max(200).default(""),
    sort: z
      .enum(["updated-desc", "updated-asc", "created-desc", "created-asc"])
      .default("updated-desc"),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  });
