import { Worker } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import {
  binaryReadEndpointSchema,
  binaryReadSelectionSchema,
  type BinaryReadPersistence,
  type BinaryReadSelection,
  type BinaryReadOffer,
  type BinaryReadEndpoint,
} from "../binary-read";
import type { BinaryRequestContext } from "../binary-publication";
import type { BlobFacts } from "./blob-protocol";
import type { SqlWorkerDriver } from "./client";
import type { PersistenceBudgetPool } from "./budget-pool";
import { ScopedReads } from "./scoped-reads";

const listeningSchema = z.strictObject({
  kind: z.literal("network-listening"),
  endpoint: binaryReadEndpointSchema,
  pid: z.number().int().positive(),
  threadId: z.number().int().positive(),
});
interface Entry {
  connection: AbortSignal;
  ready: ReturnType<typeof Promise.withResolvers<BinaryReadEndpoint>>;
  abort: AbortController;
  started: boolean;
  delivered: boolean;
  detachOffer: () => void;
  dispose: () => void;
}
export interface WorkerBinaryReadsOptions {
  driver: SqlWorkerDriver;
  budget: PersistenceBudgetPool;
  readBridgeUrl: URL;
}
/** Server-selected, verified snapshots. Endpoint authority is one-use and socket-bound;
 * data and hashing remain in actors, and brokers retain credits until actual cleanup.
 */
export class WorkerBinaryReads implements BinaryReadPersistence {
  private readonly broker: ScopedReads;
  private readonly spawn: () => Worker;
  private readonly entries = new Map<string, Entry>();
  private closing = false;
  private closed: Promise<void> | undefined;
  public constructor(options: WorkerBinaryReadsOptions) {
    if (options.readBridgeUrl.protocol !== "file:")
      throw new Error("Binary read bridge requires an explicit file URL");
    const url = new URL(options.readBridgeUrl.href);
    const egress = options.budget.networkEgress;
    this.spawn = (): Worker => egress.spawn(() => new Worker(url));
    this.broker = new ScopedReads(options.driver);
  }
  public stats(): { admissions: number; tickets: number } {
    return this.broker.stats();
  }
  public async offer(
    context: BinaryRequestContext,
    input: BinaryReadSelection,
  ): Promise<BinaryReadOffer> {
    const selection = binaryReadSelectionSchema.parse(input);
    const offer = await this.broker.offer(context, selection.plan);
    try {
      context.signal.throwIfAborted();
      context.connectionSignal.throwIfAborted();
      if (this.closing) throw new Error("Binary reads are closing");
      if (offer.sha256 !== selection.sha256)
        throw new Error("Read snapshot does not match its expected digest");
      const ready = Promise.withResolvers<BinaryReadEndpoint>();
      void ready.promise.catch(() => undefined); // Observed by endpoint lookup or retirement.
      const detachOffer = (): void =>
        context.signal.removeEventListener("abort", dispose);
      const dispose = (): void => {
        this.entries.delete(offer.ticket);
        detachOffer();
        context.connectionSignal.removeEventListener("abort", dispose);
        ready.reject(new Error("Read endpoint was retired"));
      };
      const entry: Entry = {
        connection: context.connectionSignal,
        ready,
        abort: new AbortController(),
        started: false,
        delivered: false,
        detachOffer,
        dispose,
      };
      this.entries.set(offer.ticket, entry);
      context.signal.addEventListener("abort", dispose, { once: true });
      context.connectionSignal.addEventListener("abort", dispose, {
        once: true,
      });
      return offer;
    } catch (error) {
      try {
        if (
          context.signal.aborted ||
          context.connectionSignal.aborted ||
          this.closing
        )
          await this.broker.retirement(context.connectionSignal, offer.ticket);
        else await this.broker.cancel(context, offer.ticket);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Read offer handoff and retirement failed",
          { cause: cleanup },
        );
      }
      throw error;
    }
  }
  private entry(context: BinaryRequestContext, ticket: string): Entry {
    context.signal.throwIfAborted();
    context.connectionSignal.throwIfAborted();
    if (this.closing) throw new Error("Binary reads are closing");
    const entry = this.entries.get(ticket);
    if (entry?.connection !== context.connectionSignal)
      throw new Error("Unknown or foreign read endpoint");
    return entry;
  }
  public async download(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BlobFacts> {
    const entry = this.entry(context, ticket);
    if (entry.started) throw new Error("Read already started");
    entry.started = true;
    entry.detachOffer();
    try {
      return await this.broker.download(
        {
          ...context,
          signal: AbortSignal.any([context.signal, entry.abort.signal]),
        },
        ticket,
        () => {
          const peer = this.spawn();
          peer.once("message", (input: unknown) => {
            try {
              const message = listeningSchema.parse(input);
              if (
                message.pid !== process.pid ||
                message.threadId !== peer.threadId
              )
                throw new Error("Binary read bridge identity mismatch");
              entry.ready.resolve(message.endpoint);
            } catch (error) {
              entry.ready.reject(error);
              entry.abort.abort(error);
            }
          });
          peer.once("error", (error) => entry.ready.reject(error));
          peer.once("exit", () =>
            entry.ready.reject(
              new Error("Read bridge exited before endpoint delivery"),
            ),
          );
          return peer;
        },
      );
    } finally {
      entry.dispose();
    }
  }
  public async endpoint(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BinaryReadEndpoint> {
    const entry = this.entry(context, ticket);
    if (!entry.started || entry.delivered)
      throw new Error("Read endpoint is unavailable or already consumed");
    entry.delivered = true;
    const abort = (): void => {
      entry.abort.abort(context.signal.reason);
      entry.ready.reject(context.signal.reason);
    };
    context.signal.addEventListener("abort", abort, { once: true });
    try {
      const endpoint = await entry.ready.promise;
      context.signal.throwIfAborted();
      context.connectionSignal.throwIfAborted();
      return endpoint;
    } finally {
      context.signal.removeEventListener("abort", abort);
    }
  }
  public async cancel(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<void> {
    const entry = this.entry(context, ticket);
    await this.broker.cancel(context, ticket);
    entry.dispose();
  }
  public close(): Promise<void> {
    this.closed ??= this.closeOwned();
    return this.closed;
  }
  private async closeOwned(): Promise<void> {
    this.closing = true;
    for (const entry of this.entries.values()) entry.dispose();
    await this.broker.close();
  }
}
