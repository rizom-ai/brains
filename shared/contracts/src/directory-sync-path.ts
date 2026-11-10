import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

/** A read-only placement query; the caller has already resolved stored identity. */
export const directorySyncPathRequestSchema: z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  content: z.ZodDefault<z.ZodString>;
}> = z.object({
  entityType: z.string().min(1),
  entityId: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  content: z.string().default(""),
});

export type DirectorySyncPathRequest = z.output<
  typeof directorySyncPathRequestSchema
>;

export const directorySyncPathResponseSchema: z.ZodObject<{
  relativePath: z.ZodString;
  leaf: z.ZodNullable<z.ZodObject<{ start: z.ZodNumber; end: z.ZodNumber }>>;
  owner: z.ZodOptional<
    z.ZodObject<{ entityType: z.ZodString; id: z.ZodString }>
  >;
  writable: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  relativePath: z.string(),
  /** UTF-16 display offsets, not a second identity or filesystem path. */
  leaf: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .nullable(),
  /** Identity read back from this path; optional for older directory-sync responses. */
  owner: z.object({ entityType: z.string(), id: z.string() }).optional(),
  /** Pure ID/path admission, not an existence or reservation check. */
  writable: z.boolean().optional(),
});

/** Ask directory-sync where an entity would live, before it is written. */
export const directorySyncPathContract: BusContract<
  typeof directorySyncPathRequestSchema,
  typeof directorySyncPathResponseSchema,
  "request"
> = defineBusContract({
  channel: "sync:path:request",
  request: directorySyncPathRequestSchema,
  response: directorySyncPathResponseSchema,
  delivery: "request",
});
