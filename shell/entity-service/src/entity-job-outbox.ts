import type { IJobQueueService, PreparedJobEnqueue } from "@brains/job-queue";
import {
  isPermanentJobEnqueueError,
  parseJobQueueEnqueueRequest,
} from "@brains/job-queue";
import { SerialQueue } from "@brains/utils/serial-queue";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { asc, count, eq, isNull } from "drizzle-orm";
import type { EntityDB } from "./db";
import type { ProjectionStore } from "./projection-store";
import { entityJobOutbox } from "./schema/entity-job-outbox";

const DELIVERY_BATCH_SIZE = 100;
type EntityTransaction = Parameters<Parameters<EntityDB["transaction"]>[0]>[0];

/** Relays entity-local durable job intents into the separate owner job queue. */
export class EntityJobOutbox {
  private readonly serial = new SerialQueue();
  private readonly db: EntityDB;
  private readonly jobQueueService: IJobQueueService;
  private readonly projectionStore: ProjectionStore;
  private readonly logger: Logger;
  private backgroundQueued = false;
  private stopped = false;

  public constructor(
    db: EntityDB,
    jobQueueService: IJobQueueService,
    projectionStore: ProjectionStore,
    logger: Logger,
  ) {
    this.db = db;
    this.jobQueueService = jobQueueService;
    this.projectionStore = projectionStore;
    this.logger = logger.child("EntityJobOutbox");
  }

  /** Persist an already validated intent inside the caller's entity transaction. */
  public async persist(
    transaction: EntityTransaction,
    prepared: PreparedJobEnqueue,
    createdAt: number,
  ): Promise<void> {
    if (prepared.request.idempotencyKey !== prepared.jobId) {
      throw new Error(
        "Prepared job identity does not match its idempotency key",
      );
    }
    await transaction.insert(entityJobOutbox).values({
      id: prepared.jobId,
      request: prepared.request,
      createdAt,
    });
  }

  /** Trigger a drain without making entity acknowledgement wait for job I/O. */
  public requestDrain(): void {
    if (this.stopped || this.backgroundQueued) return;
    this.backgroundQueued = true;
    const drain = this.serial.run(async () => {
      this.backgroundQueued = false;
      return this.drainAll();
    });
    void drain.then(
      (delivered) => {
        if (delivered > 0) {
          this.logger.debug("Relayed durable embedding job intents", {
            delivered,
          });
        }
      },
      (error) => {
        this.logger.error(
          "Failed to relay durable embedding job intents; intents remain pending",
          error,
        );
      },
    );
  }

  /** Drain every intent admitted before or during this serialized pass. */
  public flush(): Promise<number> {
    if (this.stopped) {
      throw new Error("Cannot flush a stopped entity job outbox");
    }
    return this.serial.run(() => this.drainAll());
  }

  /** Count durable intents for owner diagnostics and deterministic tests. */
  public async pendingCount(): Promise<number> {
    const rows = await this.projectionStore.runDatabaseOperation(() =>
      this.db
        .select({ value: count() })
        .from(entityJobOutbox)
        .where(isNull(entityJobOutbox.parkedAt)),
    );
    return Number(rows[0]?.value ?? 0);
  }

  /** Stop future delivery; an admitted queue write is left durable for replay. */
  public abandon(): void {
    this.stopped = true;
  }

  /** Resolve after every already-admitted background pass has settled. */
  public waitForIdle(): Promise<void> {
    return this.serial.idle();
  }

  private async drainAll(): Promise<number> {
    let delivered = 0;
    while (!this.isStopped()) {
      const rows = await this.projectionStore.runDatabaseOperation(() =>
        this.db
          .select()
          .from(entityJobOutbox)
          .where(isNull(entityJobOutbox.parkedAt))
          .orderBy(asc(entityJobOutbox.createdAt), asc(entityJobOutbox.id))
          .limit(DELIVERY_BATCH_SIZE),
      );
      if (rows.length === 0) return delivered;

      for (const row of rows) {
        let request: ReturnType<typeof parseJobQueueEnqueueRequest>;
        try {
          request = parseJobQueueEnqueueRequest(row.request);
          if (request.idempotencyKey !== row.id) {
            throw new Error(`Outbox job identity mismatch for ${row.id}`);
          }
        } catch (error) {
          await this.park(row.id, error);
          continue;
        }

        let jobId: string;
        try {
          jobId = await this.jobQueueService.enqueue(request);
        } catch (error) {
          if (!isPermanentJobEnqueueError(error)) throw error;
          await this.park(row.id, error);
          continue;
        }
        if (jobId !== row.id) {
          this.logger.debug("Embedding intent coalesced with an active job", {
            intentId: row.id,
            jobId,
          });
        }
        if (this.isStopped()) return delivered;
        await this.projectionStore.runDatabaseOperation(() =>
          this.db.delete(entityJobOutbox).where(eq(entityJobOutbox.id, row.id)),
        );
        delivered++;
      }
    }
    return delivered;
  }

  private async park(id: string, error: unknown): Promise<void> {
    const reason = getErrorMessage(error).slice(0, 4_000);
    await this.projectionStore.runDatabaseOperation(() =>
      this.db
        .update(entityJobOutbox)
        .set({ parkedAt: Date.now(), failureReason: reason })
        .where(eq(entityJobOutbox.id, id)),
    );
    this.logger.error("Parked an undeliverable entity job intent", {
      id,
      reason,
    });
  }

  private isStopped(): boolean {
    return this.stopped;
  }
}
