import { z } from "@brains/utils/zod";

export type EntityIdPath = [string, ...string[]];
export type EntityIdPathInput = readonly [string, ...string[]];

const SEPARATOR = ":";

const entityIdPathSegmentSchema = z
  .string()
  .min(1)
  .refine((segment) => segment !== "." && segment !== "..", {
    message: "Entity ID path segments cannot be dot segments",
  })
  .refine((segment) => !segment.includes(SEPARATOR), {
    message: `Entity ID path segments cannot contain '${SEPARATOR}'`,
  })
  .refine((segment) => !segment.includes("/") && !segment.includes("\\"), {
    message: "Entity ID path segments cannot contain path separators",
  })
  .refine((segment) => !segment.includes("\0"), {
    message: "Entity ID path segments cannot contain null bytes",
  });

/** Validates author input once; typed paths past this boundary are trusted. */
export const entityIdPathSchema: z.ZodType<EntityIdPath, unknown> = z.tuple(
  [entityIdPathSegmentSchema],
  entityIdPathSegmentSchema,
);

/** Serialize segments at a storage boundary; validate new author input separately. */
export function encodeEntityIdPath(path: EntityIdPathInput): string {
  return path.join(SEPARATOR);
}

/**
 * Decode stored identity losslessly, including values predating authoring validation.
 * Do not filter empty segments or normalize path-like values here: re-encoding must
 * reproduce the original ID. Filesystem placement belongs to directory-sync.
 */
export function decodeEntityIdPath(id: string): EntityIdPath {
  const [first = "", ...rest] = id.split(SEPARATOR);
  return [first, ...rest];
}
