import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import {
  STAGE_SLOTS,
  type StageCapability,
  type StageClaim,
} from "./binary-protocol";
import type { BinaryScope } from "./binary-client";
import type { TursoThreadProof, ProofTransaction } from "./client";

import {
  binaryUploadSizeSchema as uploadSizeSchema,
  binaryUploadTicketSchema as uploadTicketSchema,
} from "../../../src/binary-publication";
export { uploadSizeSchema, uploadTicketSchema };
export {
  binaryUploadOfferSchema as uploadOfferSchema,
  binaryUploadReceiptSchema as uploadReceiptSchema,
} from "../../../src/binary-publication";
import type {
  BinaryRequestContext as UploadControlContext,
  BinaryUploadReceipt as UploadReceipt,
} from "../../../src/binary-publication";
export type { UploadControlContext, UploadReceipt };
interface Session {
  signal: AbortSignal;
  records: Set<Admission>;
  revoke: () => void;
}
interface Admission {
  session: Session;
  ticket: string;
  size: number;
  scope: Promise<BinaryScope>;
  stage: StageCapability | undefined;
  receipt?: Readonly<UploadReceipt>;
  phase: "allocating" | "offered" | "uploading" | "sealed" | "consuming";
  abort: AbortController;
  cancelRequest: { signal: AbortSignal; abort: () => void } | undefined;
  revoked: boolean;
  busy: boolean;
  closing: Promise<void> | undefined;
  closeState: "pending" | "ok" | "failed";
  closeError: unknown;
  finished: ReturnType<typeof Promise.withResolvers<void>>;
}
/** Metadata-only proof broker. Context must come from an authenticated transport,
 * never a client-supplied session string. No bytes or caller SQL enter this API. */
export class ScopedUploads {
  private readonly driver: TursoThreadProof;
  private readonly spawn: (size: number) => Worker;
  private readonly sessions = new WeakMap<AbortSignal, Session>();
  private readonly live = new Set<Admission>();
  private readonly tickets = new Map<string, Admission>();
  private cleanupTail: Promise<void> = Promise.resolve();
  private closing = false;
  private failure: unknown;
  public constructor(
    driver: TursoThreadProof,
    spawn: (size: number) => Worker,
  ) {
    this.driver = driver;
    this.spawn = spawn;
  }
  public stats(): { admissions: number; tickets: number } {
    return { admissions: this.live.size, tickets: this.tickets.size };
  }
  public retirement(connection: AbortSignal): Promise<void> {
    return Promise.all(
      [...(this.sessions.get(connection)?.records ?? [])].map(
        (record) => record.finished.promise,
      ),
    ).then(() => undefined);
  }
  public async cleanupSettled(): Promise<void> {
    await this.cleanupTail;
    if (this.failure !== undefined) throw this.failure;
  }
  public async close(): Promise<void> {
    this.closing = true;
    const records = [...this.live];
    for (const record of records) this.revoke(record);
    const results = await Promise.allSettled(
      records.map((record) => record.finished.promise),
    );
    const errors: unknown[] = [];
    for (const result of results)
      if (result.status === "rejected") errors.push(result.reason);
    if (errors.length > 0)
      throw new AggregateError(
        errors,
        "Scoped upload cleanup could not be confirmed",
      );
  }
  public offer(
    context: UploadControlContext,
    input: number,
  ): Promise<{ ticket: string }> {
    try {
      this.check(context);
      const size = uploadSizeSchema.parse(input);
      if (this.live.size >= STAGE_SLOTS)
        throw new Error("Scoped upload admission capacity exceeded");
      const session = this.session(context.connectionSignal);
      const record: Admission = {
        session,
        size,
        ticket: randomUUID(),
        scope: this.driver.openBinaryScope(),
        stage: undefined,
        phase: "allocating",
        abort: new AbortController(),
        cancelRequest: undefined,
        revoked: false,
        busy: false,
        closing: undefined,
        closeState: "pending",
        closeError: undefined,
        finished: Promise.withResolvers<void>(),
      };
      void record.finished.promise.catch(() => undefined); // Observed by retirement/close; failures remain charged.
      this.live.add(record);
      session.records.add(record);
      return this.run(
        context,
        record,
        async () => {
          const scope = await record.scope;
          this.check(context, record);
          record.stage = await scope.begin({
            reservationBytes: size,
            expectedSize: size,
          });
          this.check(context, record);
          record.phase = "offered";
          this.tickets.set(record.ticket, record);
          return { ticket: record.ticket };
        },
        true,
        false,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  public upload(
    context: UploadControlContext,
    ticket: string,
    spawn: (size: number) => Worker = this.spawn,
  ): Promise<UploadReceipt> {
    try {
      const record = this.take(context, ticket, "offered");
      record.phase = "uploading";
      return this.run(
        context,
        record,
        async () => {
          const stage = this.stage(record);
          const facts = await this.driver.upload(
            stage,
            () => spawn(record.size),
            record.abort.signal,
          );
          this.check(context, record);
          record.phase = "sealed";
          record.ticket = randomUUID();
          this.tickets.set(record.ticket, record);
          record.receipt = Object.freeze({
            ticket: record.ticket,
            sizeBytes: facts.sizeBytes,
            sha256: facts.sha256,
          });
          return { ...record.receipt };
        },
        true,
        false,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  public consume<T>(
    context: UploadControlContext,
    ticket: string,
    body: (tx: ProofTransaction, claim: StageClaim) => Promise<T>,
  ): Promise<T> {
    return this.consumeClaim(context, ticket, async (claim) => {
      const tx = await this.driver.transaction("write", [claim]);
      let value: T;
      try {
        value = await body(tx, claim);
      } catch (error) {
        try {
          await tx.rollback();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Scoped mutation and rollback failed",
            { cause: cleanup },
          );
        }
        throw error;
      }
      await tx.commit(); // Never speculate a rollback after failed finalization.
      return value;
    });
  }

  /** Consume socket authority once, leaving transaction ownership to the service.
   * The callback must await native claim use/finalization before returning.
   */
  public consumeClaim<T>(
    context: UploadControlContext,
    ticket: string,
    body: (claim: StageClaim, receipt: Readonly<UploadReceipt>) => Promise<T>,
  ): Promise<T> {
    try {
      const record = this.take(context, ticket, "sealed");
      record.phase = "consuming";
      // Authorize once before native claim admission. Cancellation/disconnect is
      // not permission to roll back or replay a mutation admitted before revocation.
      return this.run(
        context,
        record,
        async () => {
          const scope = await record.scope;
          const claim = await scope.reserve(this.stage(record));
          let outcome: { ok: true; value: T } | { ok: false; error: unknown };
          try {
            if (!record.receipt)
              throw new Error("Sealed upload has no owner receipt");
            outcome = { ok: true, value: await body(claim, record.receipt) };
          } catch (error) {
            outcome = { ok: false, error };
          }
          try {
            await this.driver.binary({ action: "releaseClaim", claim });
          } catch (cleanup) {
            if (!outcome.ok)
              throw new AggregateError(
                [outcome.error, cleanup],
                "Scoped mutation and claim cleanup failed",
                { cause: cleanup },
              );
            throw cleanup;
          }
          if (!outcome.ok) throw outcome.error;
          return outcome.value;
        },
        false,
        true,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  public cancel(context: UploadControlContext, input: string): Promise<void> {
    try {
      this.check(context);
      const record = this.lookup(context, input);
      this.revoke(record);
      return record.finished.promise;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private stage(record: Admission): StageCapability {
    if (!record.stage) throw new Error("Scoped stage is not ready");
    return record.stage;
  }
  private check(context: UploadControlContext, record?: Admission): void {
    if (this.failure !== undefined)
      throw new Error("Scoped uploads are fenced", { cause: this.failure });
    if (
      this.closing ||
      context.connectionSignal.aborted ||
      context.signal.aborted ||
      record?.revoked
    )
      throw new Error("Upload control scope is revoked or cancelled");
  }
  private lookup(context: UploadControlContext, input: string): Admission {
    const record = this.tickets.get(uploadTicketSchema.parse(input));
    if (record?.session.signal !== context.connectionSignal)
      throw new Error("Unknown or foreign upload ticket");
    return record;
  }
  private take(
    context: UploadControlContext,
    input: string,
    phase: Admission["phase"],
  ): Admission {
    this.check(context);
    const record = this.lookup(context, input);
    if (record.phase !== phase)
      throw new Error("Upload ticket has a different purpose");
    this.clearCancellation(record);
    this.tickets.delete(record.ticket); // One use, before any await or producer creation.
    return record;
  }
  private session(signal: AbortSignal): Session {
    const existing = this.sessions.get(signal);
    if (existing) return existing;
    const session: Session = {
      signal,
      records: new Set(),
      revoke: () => {
        for (const record of session.records) this.revoke(record);
      },
    };
    this.sessions.set(signal, session);
    signal.addEventListener("abort", session.revoke, { once: true });
    return session;
  }
  private clearCancellation(record: Admission): void {
    const request = record.cancelRequest;
    request?.signal.removeEventListener("abort", request.abort);
    record.cancelRequest = undefined;
  }
  private revoke(record: Admission): void {
    if (record.revoked) return;
    record.revoked = true;
    this.clearCancellation(record);
    this.tickets.delete(record.ticket);
    record.abort.abort(new Error("Upload control scope revoked"));
    // At most STAGE_SLOTS entries, with their slots retained through settlement.
    // Serialize metadata cleanup independently of ordinary native admission.
    record.closing = this.cleanupTail.then(async () => {
      const scope = await record.scope;
      await scope.close();
    });
    this.cleanupTail = record.closing.then(
      () => {
        record.closeState = "ok";
        this.retire(record);
      },
      (error: unknown) => {
        record.closeState = "failed";
        this.failure ??= error;
        record.closeError = error;
        this.retire(record); // Do not refund an unconfirmed cleanup or skip active work.
        for (const other of this.live) this.revoke(other);
      },
    );
  }
  private retire(record: Admission): void {
    if (record.busy || !record.revoked || record.closeState === "pending")
      return;
    if (record.closeState === "failed") {
      record.finished.reject(record.closeError);
      return;
    }
    this.live.delete(record);
    record.session.records.delete(record);
    record.finished.resolve();
    if (record.session.records.size === 0) {
      record.session.signal.removeEventListener("abort", record.session.revoke);
      this.sessions.delete(record.session.signal);
    }
  }
  private async run<T>(
    context: UploadControlContext,
    record: Admission,
    operation: () => Promise<T>,
    cancellable: boolean,
    release: boolean,
  ): Promise<T> {
    record.busy = true;
    const abort = (): void => this.revoke(record);
    if (cancellable) {
      // Keep cancellation alive beyond this method's return: RPC serialization/
      // delivery can still be pending. Detach on ticket consumption or retirement.
      record.cancelRequest = { signal: context.signal, abort };
      context.signal.addEventListener("abort", abort, { once: true });
      if (context.signal.aborted) abort();
    }
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      try {
        outcome = { ok: true, value: await operation() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      if (release || !outcome.ok) this.revoke(record);
      try {
        await record.closing;
      } catch (cleanup) {
        if (!outcome.ok)
          throw new AggregateError(
            [outcome.error, cleanup],
            "Scoped upload and scope cleanup failed",
            { cause: cleanup },
          );
        throw cleanup;
      }
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    } finally {
      record.busy = false;
      this.retire(record);
    }
  }
}
