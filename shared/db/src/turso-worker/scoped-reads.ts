import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import { blobPlanSchema, type BlobPlan, type BlobFacts } from "./blob-protocol";
import { STAGE_SLOTS, type SealedStage } from "./binary-protocol";
import type { SqlWorkerDriver } from "./client";
import type { ReadScope } from "./read-client";
import { readOfferSchema, type ReadOffer } from "./network-read-protocol";

export interface ReadControlContext {
  connectionSignal: AbortSignal;
  signal: AbortSignal;
}
interface Session {
  signal: AbortSignal;
  records: Set<Admission>;
  revoke: () => void;
}
interface Admission {
  session: Session;
  ticket: string;
  scope: Promise<ReadScope>;
  read: SealedStage | undefined;
  busy: boolean;
  revoked: boolean;
  abort: AbortController;
  request: { signal: AbortSignal; abort: () => void } | undefined;
  closing: Promise<void> | undefined;
  closeState: "pending" | "ok" | "failed";
  closeError: unknown;
  finished: ReturnType<typeof Promise.withResolvers<void>>;
}
/** Server-owned read descriptors and authenticated context only. This broker is
 * metadata/lifetime policy, not an entity ACL or a remote SQL surface. */
export class ScopedReads {
  private readonly driver: SqlWorkerDriver;
  private readonly sessions = new WeakMap<AbortSignal, Session>();
  private readonly records = new Set<Admission>();
  private readonly tickets = new Map<string, Admission>();
  private cleanupTail: Promise<void> = Promise.resolve();
  private closing = false;
  private failure: unknown;
  public constructor(driver: SqlWorkerDriver) {
    this.driver = driver;
  }
  public stats(): { admissions: number; tickets: number } {
    return { admissions: this.records.size, tickets: this.tickets.size };
  }
  public offer(
    context: ReadControlContext,
    input: BlobPlan,
  ): Promise<ReadOffer> {
    try {
      this.check(context);
      const plan = blobPlanSchema.parse(input);
      if (this.records.size >= STAGE_SLOTS)
        throw new Error("Scoped read admission capacity exceeded");
      const session = this.session(context.connectionSignal);
      const record: Admission = {
        session,
        ticket: randomUUID(),
        scope: this.driver.openReadScope(),
        read: undefined,
        busy: false,
        revoked: false,
        abort: new AbortController(),
        request: undefined,
        closing: undefined,
        closeState: "pending",
        closeError: undefined,
        finished: Promise.withResolvers<void>(),
      };
      void record.finished.promise.catch(() => undefined); // Retained and observed by retirement/close, never speculative refund.
      session.records.add(record);
      this.records.add(record);
      return this.run(
        context,
        record,
        async () => {
          const scope = await record.scope;
          this.check(context, record);
          record.read = await scope.prepare(plan);
          this.check(context, record);
          this.tickets.set(record.ticket, record);
          return {
            ticket: record.ticket,
            sizeBytes: record.read.sizeBytes,
            sha256: record.read.sha256,
          };
        },
        false,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  public download(
    context: ReadControlContext,
    ticket: string,
    spawn: () => Worker,
  ): Promise<BlobFacts> {
    try {
      const record = this.take(context, ticket);
      return this.run(
        context,
        record,
        async () => {
          const scope = await record.scope;
          this.check(context, record);
          const expected = record.read;
          if (!expected) throw new Error("Read snapshot is not ready");
          const facts = await scope.download(
            expected.capability,
            spawn,
            record.abort.signal,
          );
          this.check(context, record);
          if (
            facts.sizeBytes !== expected.sizeBytes ||
            facts.sha256 !== expected.sha256
          )
            throw new Error("Read snapshot identity changed");
          return { sizeBytes: facts.sizeBytes, sha256: facts.sha256 };
        },
        true,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  public async cancel(
    context: ReadControlContext,
    ticket: string,
  ): Promise<void> {
    this.check(context);
    const id = readOfferSchema.shape.ticket.parse(ticket);
    // Download consumes endpoint authority, not cancellation authority. Session
    // records remain charged until retirement, including active/revoked reads.
    const record = [
      ...(this.sessions.get(context.connectionSignal)?.records ?? []),
    ].find((candidate) => candidate.ticket === id);
    if (!record) throw new Error("Unknown or foreign read ticket");
    this.revoke(record);
    await record.finished.promise;
  }
  public retirement(connection: AbortSignal, ticket?: string): Promise<void> {
    return Promise.all(
      [...(this.sessions.get(connection)?.records ?? [])]
        .filter((record) => ticket === undefined || record.ticket === ticket)
        .map((record) => record.finished.promise),
    ).then(() => undefined);
  }
  public async cleanupSettled(): Promise<void> {
    await this.cleanupTail;
    if (this.failure !== undefined) throw this.failure;
  }
  public async close(): Promise<void> {
    this.closing = true;
    const records = [...this.records];
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
        "Scoped read cleanup could not be confirmed",
        { cause: errors[0] },
      );
  }
  private check(context: ReadControlContext, record?: Admission): void {
    if (this.closing || this.failure !== undefined)
      throw new Error("Scoped reads are fenced", { cause: this.failure });
    if (
      context.connectionSignal.aborted ||
      context.signal.aborted ||
      record?.revoked
    )
      throw new Error("Read control scope is revoked or cancelled");
  }
  private take(context: ReadControlContext, ticket: string): Admission {
    this.check(context);
    const record = this.tickets.get(readOfferSchema.shape.ticket.parse(ticket));
    if (record?.session.signal !== context.connectionSignal)
      throw new Error("Unknown or foreign read ticket");
    this.tickets.delete(ticket);
    this.clearRequest(record);
    return record; // One use BEFORE awaits/spawning.
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
    signal.addEventListener("abort", session.revoke, { once: true });
    this.sessions.set(signal, session);
    return session;
  }
  private clearRequest(record: Admission): void {
    record.request?.signal.removeEventListener("abort", record.request.abort);
    record.request = undefined;
  }
  private revoke(record: Admission): void {
    if (record.revoked) return;
    record.revoked = true;
    this.clearRequest(record);
    this.tickets.delete(record.ticket);
    record.abort.abort(new Error("Read control scope revoked"));
    // All admissions, including unconfirmed cleanup, retain a slot. Serial cleanup
    // prevents ordinary disconnect of 16 offers from overflowing the two-slot lane.
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
        record.closeError = error;
        this.failure ??= error;
        this.retire(record);
        for (const other of this.records) this.revoke(other);
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
    this.records.delete(record);
    record.session.records.delete(record);
    record.finished.resolve();
    if (record.session.records.size === 0) {
      record.session.signal.removeEventListener("abort", record.session.revoke);
      this.sessions.delete(record.session.signal);
    }
  }
  private async run<T>(
    context: ReadControlContext,
    record: Admission,
    body: () => Promise<T>,
    finish: boolean,
  ): Promise<T> {
    record.busy = true;
    const abort = (): void => this.revoke(record);
    record.request = { signal: context.signal, abort };
    context.signal.addEventListener("abort", abort, { once: true });
    if (context.signal.aborted) abort();
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      try {
        outcome = { ok: true, value: await body() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      if (finish || !outcome.ok) this.revoke(record);
      try {
        await record.closing;
      } catch (cleanup) {
        if (!outcome.ok)
          throw new AggregateError(
            [outcome.error, cleanup],
            "Read and scope cleanup failed",
            { cause: cleanup },
          );
        throw cleanup;
      }
      if (!outcome.ok) throw outcome.error;
      // For an offered ticket, keep request cancellation alive through pending
      // RPC serialization/delivery; detach only on consumption or retirement.
      return outcome.value;
    } finally {
      record.busy = false;
      this.retire(record);
    }
  }
}
