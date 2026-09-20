import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import type { EntityRegistry } from "./types";
import { entities } from "./schema/entities";
import { entityRevision, stableJson } from "./entity-revision";

const PAGE_SIZE = 200;
const MAX_ATTEMPTS = 4;
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
const columns = {
  id: sql<ArrayBuffer>`CAST(${entities.id} AS BLOB)`,
  entityType: sql<ArrayBuffer>`CAST(${entities.entityType} AS BLOB)`,
  content: sql<ArrayBuffer>`CAST(${entities.content} AS BLOB)`,
  contentHash: entities.contentHash,
  metadata: entities.metadata,
  visibility: entities.visibility,
};
interface ProjectionRow {
  id: ArrayBuffer;
  entityType: ArrayBuffer;
  content: ArrayBuffer;
  contentHash: string;
  metadata: Record<string, unknown>;
  visibility: string;
}

/** Metadata-only bootstrap. Never calls ordinary mutations or export/event paths. */
export async function reprojectGroupings(
  db: EntityDB,
  registry: EntityRegistry,
): Promise<void> {
  const fields = new Map<string, Set<string>>();
  for (const grouping of registry.getGroupings()) {
    for (const type of grouping.types) {
      const keys = fields.get(type) ?? new Set<string>();
      keys.add(grouping.field);
      fields.set(type, keys);
    }
  }
  if (fields.size === 0) return;
  let cursor: { type: string; id: string } | undefined;
  for (;;) {
    const rows = await db
      .select(columns)
      .from(entities)
      .where(
        and(
          inArray(entities.entityType, [...fields.keys()]),
          cursor
            ? or(
                gt(entities.entityType, cursor.type),
                and(
                  eq(entities.entityType, cursor.type),
                  gt(entities.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(entities.entityType), asc(entities.id))
      .limit(PAGE_SIZE);
    if (rows.length === 0) return;
    for (const row of rows) {
      const type = decoder.decode(row.entityType);
      const id = decoder.decode(row.id);
      await reprojectRow(db, registry, row, fields.get(type) ?? new Set());
      cursor = { type, id };
    }
  }
}

async function reprojectRow(
  db: EntityDB,
  registry: EntityRegistry,
  initial: ProjectionRow,
  fields: ReadonlySet<string>,
): Promise<void> {
  const type = decoder.decode(initial.entityType);
  const id = decoder.decode(initial.id);
  const destination = and(eq(entities.entityType, type), eq(entities.id, id));
  let row: ProjectionRow | undefined = initial;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!row) return; // A concurrent deletion is never an insertion request.
    const content = decoder.decode(row.content);
    let projected: Record<string, unknown> = {};
    try {
      projected = registry.projectMetadata(type, content, row.metadata);
    } catch (error) {
      // Invalid persisted fields remain authored source, but cannot be indexed.
      if (!(error instanceof z.ZodError)) throw error;
    }
    const metadata = { ...row.metadata };
    for (const field of fields) {
      delete metadata[field];
      if (Object.hasOwn(projected, field)) metadata[field] = projected[field];
    }
    if (stableJson(metadata) === stableJson(row.metadata)) return;
    const expectedRevision = entityRevision(row);
    const outcome = await db.transaction(async (tx) => {
      const current = (
        await tx.select(columns).from(entities).where(destination).limit(1)
      )[0];
      if (!current) return "deleted";
      // SQLite serializes writers inside this transaction. Include source too,
      // so an out-of-band content edit with an unchanged hash cannot win a race.
      if (
        entityRevision(current) !== expectedRevision ||
        decoder.decode(current.content) !== content
      )
        return "conflict";
      await tx.update(entities).set({ metadata }).where(destination);
      return "updated";
    });
    if (outcome !== "conflict") return;
    row = (
      await db.select(columns).from(entities).where(destination).limit(1)
    )[0];
  }
  throw new Error(
    "Grouping reprojection exceeded concurrent-write retry limit",
  );
}
