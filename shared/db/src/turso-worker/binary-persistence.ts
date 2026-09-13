import { Worker } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import {
  binaryUploadEndpointSchema,
  type BinaryPersistence,
  type BinaryPublication,
  type BinaryRequestContext,
  type BinaryUploadOffer,
  type BinaryUploadReceipt,
  type BinaryUploadEndpoint,
} from "../binary-publication";
import { ScopedUploads } from "./scoped-uploads";
import { WorkerPublicationBindings } from "./publication-bindings";
import type { SqlWorkerDriver } from "./client";
import type { PersistenceBudgetPool } from "./budget-pool";

const listeningSchema = z.strictObject({
  kind: z.literal("network-listening"),
  endpoint: binaryUploadEndpointSchema,
  pid: z.number().int().positive(),
  threadId: z.number().int().positive(),
});
interface EndpointEntry {
  connection: AbortSignal;
  ready: ReturnType<typeof Promise.withResolvers<BinaryUploadEndpoint>>;
  abort: AbortController;
  started: boolean;
  cleanup: () => void;
}
export interface WorkerBinaryPersistenceOptions {
  driver: SqlWorkerDriver;
  /** The owner's shared pool, also supplied when constructing its SQL drivers. */
  budget: PersistenceBudgetPool;
  /** Explicit installed/source artifact URL; never inferred from cwd. */
  uploadBridgeUrl: URL;
}

/** Authenticated metadata control over a credited, off-thread upload plane.
 * Install bindings on the same driver's database, and close before the driver.
 */
export class WorkerBinaryPersistence implements BinaryPersistence {
  public readonly bindings: WorkerPublicationBindings =
    new WorkerPublicationBindings();
  private readonly broker: ScopedUploads;
  private readonly spawn: () => Worker;
  private readonly endpoints = new Map<string, EndpointEntry>();
  private closePromise: Promise<void> | undefined;
  private closing = false;
  private acknowledgedClosed = false;

  public constructor(options: WorkerBinaryPersistenceOptions) {
    if (options.uploadBridgeUrl.protocol !== "file:")
      throw new Error("Binary upload bridge requires an explicit file URL");
    const url = new URL(options.uploadBridgeUrl.href);
    const ingress = options.budget.networkIngress;
    this.spawn = (): Worker => ingress.spawn(() => new Worker(url));
    this.broker = new ScopedUploads(options.driver, () => {
      throw new Error("Binary upload requires its admitted network bridge");
    });
  }
  public get closed(): boolean {
    return this.acknowledgedClosed;
  }
  public stats(): { admissions: number; tickets: number } {
    return this.broker.stats();
  }

  public async offer(
    context: BinaryRequestContext,
    size: number,
  ): Promise<BinaryUploadOffer> {
    const offer = await this.broker.offer(context, size);
    try {
      context.signal.throwIfAborted();
      context.connectionSignal.throwIfAborted();
      if (this.closing) throw new Error("Binary persistence is closing");
      const ready = Promise.withResolvers<BinaryUploadEndpoint>();
      void ready.promise.catch(() => undefined); // Observed by endpoint lookup or upload/shutdown settlement.
      const cleanup = (): void => {
        this.endpoints.delete(offer.ticket);
        context.connectionSignal.removeEventListener("abort", cleanup);
        ready.reject(new Error("Upload endpoint connection closed"));
      };
      context.connectionSignal.addEventListener("abort", cleanup, {
        once: true,
      });
      this.endpoints.set(offer.ticket, {
        connection: context.connectionSignal,
        ready,
        abort: new AbortController(),
        started: false,
        cleanup,
      });
      return offer;
    } catch (error) {
      // A successful native offer whose metadata handoff fails still needs an
      // acknowledged retirement. An aborted request cannot cancel itself.
      try {
        if (context.connectionSignal.aborted || this.closing)
          await this.broker.retirement(context.connectionSignal);
        else
          await this.broker.cancel(
            { ...context, signal: new AbortController().signal },
            offer.ticket,
          );
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Binary offer handoff and retirement failed",
          { cause: cleanup },
        );
      }
      throw error;
    }
  }
  private entry(context: BinaryRequestContext, ticket: string): EndpointEntry {
    context.signal.throwIfAborted();
    context.connectionSignal.throwIfAborted();
    if (this.closing) throw new Error("Binary persistence is closing");
    const entry = this.endpoints.get(ticket);
    if (entry?.connection !== context.connectionSignal)
      throw new Error("Unknown or foreign upload endpoint");
    return entry;
  }
  public async upload(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BinaryUploadReceipt> {
    const entry = this.entry(context, ticket);
    if (entry.started) throw new Error("Upload already started");
    entry.started = true;
    try {
      return await this.broker.upload(
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
                throw new Error("Binary upload bridge identity mismatch");
              entry.ready.resolve(message.endpoint);
            } catch (error) {
              entry.ready.reject(error);
              entry.abort.abort(error);
            }
          });
          peer.once("error", (error) => entry.ready.reject(error));
          peer.once("exit", () =>
            entry.ready.reject(
              new Error("Upload bridge exited before endpoint delivery"),
            ),
          );
          return peer;
        },
      );
    } catch (error) {
      entry.ready.reject(error);
      entry.cleanup();
      throw error;
    }
  }
  public async endpoint(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BinaryUploadEndpoint> {
    const entry = this.entry(context, ticket);
    if (!entry.started) throw new Error("Upload has not started");
    this.endpoints.delete(ticket); // Consume socket-bound authority before await.
    try {
      const endpoint = await entry.ready.promise;
      context.signal.throwIfAborted();
      context.connectionSignal.throwIfAborted();
      return endpoint;
    } finally {
      entry.cleanup();
    }
  }
  public async cancel(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<void> {
    await this.broker.cancel(context, ticket);
    const entry = this.endpoints.get(ticket);
    if (entry?.connection === context.connectionSignal) entry.cleanup();
  }
  public consume<T>(
    context: BinaryRequestContext,
    ticket: string,
    operation: (publication: BinaryPublication) => Promise<T>,
  ): Promise<T> {
    return this.broker.consumeClaim(context, ticket, (claim, receipt) =>
      this.bindings.withClaim(claim, receipt, operation),
    );
  }
  public close(): Promise<void> {
    this.closePromise ??= this.closeOwned();
    return this.closePromise;
  }
  private async closeOwned(): Promise<void> {
    this.closing = true;
    for (const entry of this.endpoints.values()) entry.cleanup();
    await this.broker.close();
    this.acknowledgedClosed = true;
  }
}
