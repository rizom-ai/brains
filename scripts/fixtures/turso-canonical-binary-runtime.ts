// Execution adapter for the candidate database factory; source owns RPC routing.
import assert from "node:assert/strict";
import { z } from "@brains/utils/zod";
import {
  binaryUploadEndpointSchema,
  type BinaryPersistence,
  type BinaryPublication,
  type BinaryRequestContext,
  type BinaryUploadOffer,
  type BinaryUploadReceipt,
  type BinaryUploadEndpoint,
} from "@brains/db/binary-publication";
import type { ScopedUploads } from "../../shared/db/src/turso-worker/scoped-uploads";
import type { CanonicalAssetBindings } from "./turso-canonical-asset-bindings";
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
export class CanonicalBinaryRuntime implements BinaryPersistence {
  private readonly binding: CanonicalAssetBindings;
  private readonly broker: ScopedUploads;
  private readonly endpoints = new Map<string, EndpointEntry>();
  private closePromise: Promise<void> | undefined;
  private acknowledgedClosed = false;
  public get closed(): boolean {
    return this.acknowledgedClosed;
  }
  public constructor(binding: CanonicalAssetBindings) {
    this.binding = binding;
    this.broker = binding.createUploadBroker();
  }
  public stats(): { admissions: number; tickets: number } {
    return this.broker.stats();
  }
  public async offer(
    context: BinaryRequestContext,
    size: number,
  ): Promise<BinaryUploadOffer> {
    const offer = await this.broker.offer(context, size);
    context.signal.throwIfAborted();
    context.connectionSignal.throwIfAborted();
    const ready = Promise.withResolvers<BinaryUploadEndpoint>();
    void ready.promise.catch(() => undefined); // Observed by endpoint lookup or upload/shutdown settlement.
    const cleanup = (): void => {
      this.endpoints.delete(offer.ticket);
      context.connectionSignal.removeEventListener("abort", cleanup);
      ready.reject(new Error("Upload endpoint connection closed"));
    };
    context.connectionSignal.addEventListener("abort", cleanup, { once: true });
    this.endpoints.set(offer.ticket, {
      connection: context.connectionSignal,
      ready,
      abort: new AbortController(),
      started: false,
      cleanup,
    });
    return offer;
  }
  private entry(context: BinaryRequestContext, ticket: string): EndpointEntry {
    context.signal.throwIfAborted();
    context.connectionSignal.throwIfAborted();
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
          const peer = this.binding.spawnUploadBridge();
          peer.once("message", (input: unknown) => {
            try {
              const message = listeningSchema.parse(input);
              assert.equal(message.pid, process.pid);
              assert.equal(message.threadId, peer.threadId);
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
    this.endpoints.delete(ticket);
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
      this.binding.withBinaryClaim(claim, receipt, operation),
    );
  }
  public close(): Promise<void> {
    this.closePromise ??= this.closeOwned();
    return this.closePromise;
  }
  private async closeOwned(): Promise<void> {
    this.binding.assertOwnerOpen();
    try {
      await this.broker.close();
      this.binding.assertOwnerOpen();
      this.acknowledgedClosed = true;
    } finally {
      for (const entry of this.endpoints.values()) entry.cleanup();
    }
  }
}
