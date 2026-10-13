import { z } from "@brains/utils/zod";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export type EntityIdPath = [string, ...string[]];
export type EntityIdPathInput = readonly [string, ...string[]];

const SEPARATOR = ":";

const storedSegmentSchema = z
  .string()
  .refine((segment) => !segment.includes(SEPARATOR), {
    message: `Entity ID path segments cannot contain '${SEPARATOR}'`,
  });

/** Navigation of existing identity is not validation of a new filesystem-safe path. */
export const storedEntityIdPathSchema: z.ZodType<EntityIdPath, unknown> =
  z.tuple([storedSegmentSchema], storedSegmentSchema);

const entityIdPathSegmentSchema = storedSegmentSchema
  .min(1)
  .refine((segment) => segment !== "." && segment !== "..", {
    message: "Entity ID path segments cannot be dot segments",
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

/** Database projection uses the same separator as encoding, never a second parser. */
export function entityIdHierarchyExpressions(
  id: SQLWrapper,
  prefix: EntityIdPathInput | null,
): { withinPrefix: SQL; directChild: SQL; childName: SQL<ArrayBuffer> } {
  const prefixId =
    prefix === null ? "" : encodeEntityIdPath(prefix) + SEPARATOR;
  // Byte comparisons are case-sensitive, treat LIKE metacharacters literally,
  // and preserve Unicode and embedded NULs (SQLite text length stops at NUL).
  const bytes = sql`CAST(${id} AS BLOB)`;
  const prefixBytes = sql`CAST(${prefixId} AS BLOB)`;
  const remainder = sql`substr(${bytes}, length(${prefixBytes}) + 1)`;
  const separatorAt = sql`instr(${remainder}, CAST(${SEPARATOR} AS BLOB))`;
  return {
    // A half-open range preserves literal, binary prefix matching and lets
    // SQLite seek its existing ID index. The terminal separator supplies the
    // upper bound; callers never construct it or know its representation.
    withinPrefix:
      prefix === null
        ? sql`1 = 1`
        : sql`${id} >= ${prefixId} AND ${id} < ${encodeEntityIdPath(prefix) + String.fromCharCode(SEPARATOR.charCodeAt(0) + 1)}`,
    directChild: sql`${separatorAt} = 0`,
    childName: sql<ArrayBuffer>`substr(${remainder}, 1, ${separatorAt} - 1)`,
  };
}
