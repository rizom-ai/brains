import { and, asc, eq, or } from "drizzle-orm";
import { createId } from "@brains/utils/id";
import type { EntityDB } from "./db";
import { entityExportIntents } from "./schema/entity-export-state";
import type {
  EntityExportAcknowledgement,
  EntityExportIntent,
} from "./entity-export-types";

export type EntityExportTransaction = Parameters<
  Parameters<EntityDB["transaction"]>[0]
>[0];

export interface RecordEntityExportInput {
  entityType: string;
  entityId: string;
  operation: "upsert" | "delete";
  markedAt?: number;
}

/** Durable outbox shared by ordinary and projection-owned entity mutations. */
export class EntityExportStore {
  private readonly db: EntityDB;
  private readonly now: () => number;

  constructor(db: EntityDB, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  public async record(
    transaction: EntityExportTransaction,
    input: RecordEntityExportInput,
  ): Promise<void> {
    await this.upsert(transaction, input);
  }

  public async clear(
    transaction: EntityExportTransaction,
    target: { entityType: string; entityId: string },
  ): Promise<void> {
    await transaction
      .delete(entityExportIntents)
      .where(
        and(
          eq(entityExportIntents.entityType, target.entityType),
          eq(entityExportIntents.entityId, target.entityId),
        ),
      );
  }

  public list(): Promise<EntityExportIntent[]> {
    return this.db
      .select()
      .from(entityExportIntents)
      .orderBy(
        asc(entityExportIntents.markedAt),
        asc(entityExportIntents.entityType),
        asc(entityExportIntents.entityId),
      );
  }

  public async hasPending(): Promise<boolean> {
    const rows = await this.db
      .select({ entityId: entityExportIntents.entityId })
      .from(entityExportIntents)
      .limit(1);
    return rows.length > 0;
  }

  public async acknowledge(
    acknowledgements: readonly EntityExportAcknowledgement[],
  ): Promise<number> {
    if (acknowledgements.length === 0) return 0;
    const conditions = acknowledgements.map((intent) =>
      and(
        eq(entityExportIntents.entityType, intent.entityType),
        eq(entityExportIntents.entityId, intent.entityId),
        eq(entityExportIntents.revision, intent.revision),
      ),
    );
    const result = await this.db
      .delete(entityExportIntents)
      .where(or(...conditions));
    return Number(result.rowsAffected);
  }

  private async upsert(
    database: Pick<EntityDB, "insert"> | EntityExportTransaction,
    input: RecordEntityExportInput,
  ): Promise<void> {
    const value = {
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      revision: createId(),
      markedAt: input.markedAt ?? this.now(),
    };
    await database
      .insert(entityExportIntents)
      .values(value)
      .onConflictDoUpdate({
        target: [entityExportIntents.entityType, entityExportIntents.entityId],
        set: {
          operation: value.operation,
          revision: value.revision,
          markedAt: value.markedAt,
        },
      });
  }
}
