import { z } from "@brains/utils/zod";

export interface DirectorySyncPathRequest {
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  content: string;
}

/** A read-only placement query; the caller has already resolved stored identity. */
export const directorySyncPathRequestSchema: z.ZodType<DirectorySyncPathRequest> =
  z.object({
    entityType: z.string().min(1),
    entityId: z.string(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    content: z.string().default(""),
  });

export const directorySyncPathResponseSchema: z.ZodType<{
  relativePath: string;
  /** UTF-16 display offsets, not a second identity or filesystem path. */
  leaf: { start: number; end: number } | null;
}> = z.object({
  relativePath: z.string(),
  leaf: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .nullable(),
});
