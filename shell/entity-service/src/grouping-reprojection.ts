import { and, asc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
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
interface Cursor {
  type: string;
  id: string;
}
interface RowTarget {
  type: string;
  id: string;
  destination: SQL | undefined;
  fields: ReadonlySet<string>;
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
  // Declaration equality does not prove projection freshness: register-only
  // writers may have run without these declarations, or field validators may
  // have changed. Revalidate source on every serving start until every writer
  // and schema change participates in a durable invalidation protocol.
  await reprojectPage(db, registry, fields, undefined);
}

/** Keyset paging over (entityType, id); each page continues from its own tail. */
async function reprojectPage(
  db: EntityDB,
  registry: EntityRegistry,
  fields: ReadonlyMap<string, ReadonlySet<string>>,
  cursor: Cursor | undefined,
): Promise<void> {
  const rows = await db
    .select(columns)
    .from(entities)
    .where(and(inArray(entities.entityType, [...fields.keys()]), after(cursor)))
    .orderBy(asc(entities.entityType), asc(entities.id))
    .limit(PAGE_SIZE);
  for (const row of rows) {
    const type = decoder.decode(row.entityType);
    await reprojectRow(db, registry, row, fields.get(type) ?? new Set());
  }
  const tail = rows.at(-1);
  if (!tail || rows.length < PAGE_SIZE) return;
  return reprojectPage(db, registry, fields, {
    type: decoder.decode(tail.entityType),
    id: decoder.decode(tail.id),
  });
}

function after(cursor: Cursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    gt(entities.entityType, cursor.type),
    and(eq(entities.entityType, cursor.type), gt(entities.id, cursor.id)),
  );
}

async function reprojectRow(
  db: EntityDB,
  registry: EntityRegistry,
  initial: ProjectionRow,
  fields: ReadonlySet<string>,
): Promise<void> {
  const type = decoder.decode(initial.entityType);
  const id = decoder.decode(initial.id);
  return attemptRow(
    db,
    registry,
    {
      type,
      id,
      destination: and(eq(entities.entityType, type), eq(entities.id, id)),
      fields,
    },
    initial,
    MAX_ATTEMPTS,
  );
}

/** One revision-conditional write, retried against fresh state on conflict. */
async function attemptRow(
  db: EntityDB,
  registry: EntityRegistry,
  target: RowTarget,
  row: ProjectionRow | undefined,
  remaining: number,
): Promise<void> {
  if (!row) return; // A concurrent deletion is never an insertion request.
  if (remaining === 0)
    throw new Error(
      "Grouping reprojection exceeded concurrent-write retry limit",
    );
  const content = decoder.decode(row.content);
  // Invalid persisted fields remain authored source, but cannot be indexed.
  // Only the offending field is skipped; its siblings still project.
  const projected = registry.projectStoredMetadata(
    target.type,
    content,
    row.metadata,
  );
  const metadata = { ...row.metadata };
  for (const field of target.fields) {
    delete metadata[field];
    if (Object.hasOwn(projected, field)) metadata[field] = projected[field];
  }
  if (stableJson(metadata) === stableJson(row.metadata)) return;
  const expectedRevision = entityRevision(row);
  const outcome = await db.transaction(async (tx) => {
    const current = (
      await tx.select(columns).from(entities).where(target.destination).limit(1)
    )[0];
    if (!current) return "deleted";
    // SQLite serializes writers inside this transaction. Include source too,
    // so an out-of-band content edit with an unchanged hash cannot win a race.
    if (
      entityRevision(current) !== expectedRevision ||
      decoder.decode(current.content) !== content
    )
      return "conflict";
    await tx.update(entities).set({ metadata }).where(target.destination);
    return "updated";
  });
  if (outcome !== "conflict") return;
  const current = (
    await db.select(columns).from(entities).where(target.destination).limit(1)
  )[0];
  return attemptRow(db, registry, target, current, remaining - 1);
}
