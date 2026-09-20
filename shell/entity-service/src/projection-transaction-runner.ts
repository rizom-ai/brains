import { getErrorMessage } from "@brains/utils/error";
import { SerialQueue } from "@brains/utils/serial-queue";
import type { EntityDB } from "./db";

const WRITE_RETRY_BUDGET_MS = 2_000;
const WRITE_RETRY_BASE_DELAY_MS = 5;
const WRITE_RETRY_MAX_DELAY_MS = 40;

export type EntityTransaction = Parameters<
  Parameters<EntityDB["transaction"]>[0]
>[0];

export interface SqliteWriteRetryOptions {
  retryBudgetMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

function isSqliteWriteConflict(error: unknown): boolean {
  for (let current = error; current !== undefined;) {
    const code =
      typeof current === "object" && current !== null && "code" in current
        ? String(current.code)
        : "";
    const message = getErrorMessage(current, "");
    if (
      /SQLITE_(?:BUSY|LOCKED)/u.test(code) ||
      /SQLITE_(?:BUSY|LOCKED)|database is locked/iu.test(message)
    ) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export async function retrySqliteWrite<TResult>(
  write: () => Promise<TResult>,
  options: SqliteWriteRetryOptions = {},
): Promise<TResult> {
  const retryBudgetMs = options.retryBudgetMs ?? WRITE_RETRY_BUDGET_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((delayMs: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;
  const deadline = now() + retryBudgetMs;

  /** One attempt per step, backing off until the budget would be overrun. */
  const attemptWrite = async (attempt: number): Promise<TResult> => {
    try {
      return await write();
    } catch (error) {
      if (!isSqliteWriteConflict(error)) throw error;
      const backoff = Math.min(
        WRITE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        WRITE_RETRY_MAX_DELAY_MS,
      );
      const delay = backoff / 2 + random() * (backoff / 2);
      if (now() + delay >= deadline) throw error;
      await sleep(delay);
      return attemptWrite(attempt + 1);
    }
  };
  return attemptWrite(1);
}

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
    return this.queue.run(() => this.db.transaction(transaction));
  }

  public runSqliteWrite<TResult>(
    write: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.queue.run(() => retrySqliteWrite(write));
  }
}
