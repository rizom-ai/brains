import { SerialQueue } from "@brains/utils/serial-queue";
import type { EntityDB } from "./db";

export type EntityTransaction = Parameters<
  Parameters<EntityDB["transaction"]>[0]
>[0];

/** Serializes transactions that coordinate projection state in one database. */
export class ProjectionTransactionRunner {
  private readonly db: EntityDB;
  private readonly queue = new SerialQueue();

  public constructor(db: EntityDB) {
    this.db = db;
  }

  public run<TResult>(
    transaction: (database: EntityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    // The shared client retries refused BEGINs within one acquisition budget.
    // Retrying here would add a second budget and risk replaying admitted work.
    return this.queue.run(() => this.db.transaction(transaction));
  }

  public runSqliteWrite<TResult>(
    write: () => Promise<TResult>,
  ): Promise<TResult> {
    // The shared client retries a refused standalone write within its budget.
    return this.queue.run(write);
  }
}
