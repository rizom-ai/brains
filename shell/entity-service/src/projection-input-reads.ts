import { and, asc, eq, gt, lte, sql, type SQLWrapper } from "drizzle-orm";
import type { EntityTransaction } from "./projection-transaction-runner";
import {
  projectionDirtyInputs,
  projectionWaveInputs,
  type ProjectionDirtyInput,
  type ProjectionWaveInput,
} from "./schema/projection-state";

function textBytes(columns: SQLWrapper[]): ReturnType<typeof sql<number>> {
  return sql<number>`${sql.join(
    columns.map((column) => sql`length(cast(${column} as blob))`),
    sql` + `,
  )}`;
}

/** Callers supply one existing transaction snapshot, never a root-client read. */
async function readPages<T extends { generation: number }>(
  sizes: (after: number | undefined) => Promise<{ bytes: number }[]>,
  rows: (after: number | undefined, count: number) => Promise<T[]>,
): Promise<T[]> {
  const inputs: T[] = [];
  let generation: number | undefined;
  for (;;) {
    const candidates = await sizes(generation);
    if (candidates.length === 0) return inputs;
    // At most 32 rows and 4 KiB raw text leave room for sixfold JSON escaping
    // and typed-cell overhead under 64 KiB. BLOB lengths include UTF-8/NULs.
    // An individually oversized row still fails the native result guard.
    let count = 0;
    let bytes = 0;
    for (const candidate of candidates) {
      if (count > 0 && bytes + candidate.bytes > 4096) break;
      count++;
      bytes += candidate.bytes;
    }
    const page = await rows(generation, count);
    const last = page.at(-1);
    if (!last || page.length !== count)
      throw new Error("Projection snapshot lost its selected rows");
    inputs.push(...page);
    generation = last.generation;
  }
}

export function readPendingProjectionInputs(
  transaction: EntityTransaction,
  cutoff?: number,
): Promise<ProjectionDirtyInput[]> {
  const table = projectionDirtyInputs;
  const predicate = (after: number | undefined): ReturnType<typeof and> =>
    and(
      after === undefined ? undefined : gt(table.generation, after),
      cutoff === undefined ? undefined : lte(table.generation, cutoff),
    );
  return readPages(
    async (after) =>
      transaction
        .select({
          bytes: textBytes([
            table.sourceType,
            table.sourceId,
            table.revision,
            table.operation,
          ]),
        })
        .from(table)
        .where(predicate(after))
        .orderBy(asc(table.generation))
        .limit(32),
    async (after, count) =>
      transaction
        .select()
        .from(table)
        .where(predicate(after))
        .orderBy(asc(table.generation))
        .limit(count),
  );
}

export function readWaveProjectionInputs(
  transaction: EntityTransaction,
  waveId: string,
): Promise<ProjectionWaveInput[]> {
  const table = projectionWaveInputs;
  const predicate = (after: number | undefined): ReturnType<typeof and> =>
    and(
      eq(table.waveId, waveId),
      after === undefined ? undefined : gt(table.generation, after),
    );
  return readPages(
    async (after) =>
      transaction
        .select({
          bytes: textBytes([
            table.waveId,
            table.sourceType,
            table.sourceId,
            table.revision,
            table.operation,
          ]),
        })
        .from(table)
        .where(predicate(after))
        .orderBy(asc(table.generation))
        .limit(32),
    async (after, count) =>
      transaction
        .select()
        .from(table)
        .where(predicate(after))
        .orderBy(asc(table.generation))
        .limit(count),
  );
}
