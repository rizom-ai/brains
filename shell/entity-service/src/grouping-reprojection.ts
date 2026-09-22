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
interface ProjectionWrite {
  target: RowTarget;
  row: ProjectionRow;
  content: string;
  metadata: Record<string, unknown>;
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
  await reprojectRows(db, registry, rows, fields);
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

async function reprojectRows(
  db: EntityDB,
  registry: EntityRegistry,
  rows: ProjectionRow[],
  fields: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<void> {
  // Parse before taking the writer lock. One bounded page shares a commit,
  // avoiding a durable transaction for every entity on slower disks.
  const writes = rows.flatMap((row): ProjectionWrite[] => {
    const type = decoder.decode(row.entityType);
    const id = decoder.decode(row.id);
    const write = prepareWrite(
      registry,
      {
        type,
        id,
        destination: and(eq(entities.entityType, type), eq(entities.id, id)),
        fields: fields.get(type) ?? new Set(),
      },
      row,
    );
    return write ? [write] : [];
  });
  if (writes.length === 0) return;
  const conflicts = await db.transaction(async (tx): Promise<RowTarget[]> => {
    const conflicts: RowTarget[] = [];
    for (const write of writes) {
      if ((await commitProjection(tx, write)) === "conflict")
        conflicts.push(write.target);
    }
    return conflicts;
  });
  // Retry only conflicted identities, outside the page transaction, against
  // fresh source. The page attempt counts toward the same bounded budget.
  for (const target of conflicts) {
    const current = (
      await db.select(columns).from(entities).where(target.destination).limit(1)
    )[0];
    await attemptRow(db, registry, target, current, MAX_ATTEMPTS - 1);
  }
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
  const write = prepareWrite(registry, target, row);
  if (!write) return;
  const outcome = await db.transaction((tx) => commitProjection(tx, write));
  if (outcome !== "conflict") return;
  const current = (
    await db.select(columns).from(entities).where(target.destination).limit(1)
  )[0];
  return attemptRow(db, registry, target, current, remaining - 1);
}

function prepareWrite(
  registry: EntityRegistry,
  target: RowTarget,
  row: ProjectionRow,
): ProjectionWrite | undefined {
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
  if (stableJson(metadata) === stableJson(row.metadata)) return undefined;
  return { target, row, content, metadata };
}

async function commitProjection(
  db: Pick<EntityDB, "select" | "update">,
  write: ProjectionWrite,
): Promise<"deleted" | "conflict" | "updated"> {
  const { target, row, content, metadata } = write;
  const current = (
    await db.select(columns).from(entities).where(target.destination).limit(1)
  )[0];
  if (!current) return "deleted";
  // SQLite serializes writers inside this transaction. Include source too,
  // so an out-of-band content edit with an unchanged hash cannot win a race.
  if (
    entityRevision(current) !== entityRevision(row) ||
    decoder.decode(current.content) !== content
  )
    return "conflict";
  await db.update(entities).set({ metadata }).where(target.destination);
  return "updated";
}
