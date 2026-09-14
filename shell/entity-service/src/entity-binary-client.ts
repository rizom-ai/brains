import { z } from "@brains/utils/zod";
import type { AssetRef } from "@brains/assets";
import {
  binaryUploadOfferSchema,
  binaryUploadReceiptSchema,
  binaryUploadEndpointSchema,
  type BinaryUploadOffer,
  type BinaryUploadReceipt,
  type BinaryUploadEndpoint,
} from "@brains/db/binary-publication";
import {
  binaryReadOfferSchema,
  binaryReadEndpointSchema,
  binaryReadFactsSchema,
  type BinaryReadOffer,
  type BinaryReadEndpoint,
} from "@brains/db/binary-read";
import {
  parseEntityBinaryControlRequest,
  parseEntityBinaryPublicationCall,
  type EntityBinaryControlRequest,
} from "./entity-binary-rpc";
import {
  parseEntityRpcResult,
  type EntityPublicationRpcRequest,
} from "./entity-rpc";
import type { EntityMutationResult } from "./types";
import type { ProjectionBatchScope } from "./projection-store";
import {
  downloadEntityFile,
  type EntityFileDownloadInput,
  type EntityFileDownloadActor,
} from "./entity-file-download";

export interface EntityBinaryRequestOptions {
  signal?: AbortSignal | undefined;
}
/** Both functions must use the same authenticated connection. Its creator owns
 * connection shutdown and joins; this metadata client neither opens nor closes it.
 */
export interface EntityBinaryClientTransport {
  /** Fence the owning connection after an untrustworthy service reply; not a cleanup acknowledgement. */
  invalidate(error: unknown): void;
  control(
    input: unknown,
    options?: EntityBinaryRequestOptions,
  ): Promise<unknown>;
  publication(
    input: unknown,
    options?: EntityBinaryRequestOptions,
  ): Promise<unknown>;
}
export interface EntityBinaryClientOptions {
  transport: EntityBinaryClientTransport;
  assertLive?: () => void;
  getBatchScope?: () => ProjectionBatchScope | undefined;
}
export type EntityBinaryReadFacts = z.output<typeof binaryReadFactsSchema>;
const cancelledSchema = z.null();

/** Reference/ticket/receipt client. Never hashes, assembles, forwards, or falls
 * back to buffered asset RPC. Actor and native retirement acknowledgements remain
 * distinct from request cancellation; a published mutation is never replayed.
 */
export class EntityBinaryClient {
  private readonly transport: EntityBinaryClientTransport;
  private failure: unknown;
  private readonly assertLive: (() => void) | undefined;
  private readonly getBatchScope:
    (() => ProjectionBatchScope | undefined) | undefined;
  public constructor(options: EntityBinaryClientOptions) {
    this.transport = options.transport;
    this.assertLive = options.assertLive;
    this.getBatchScope = options.getBatchScope;
  }
  private assertOpen(): void {
    this.assertLive?.();
    if (this.failure !== undefined)
      throw new Error("Binary client is fenced", { cause: this.failure });
  }
  private fence(error: unknown): void {
    if (this.failure !== undefined) return;
    this.failure = error;
    try {
      this.transport.invalidate(error);
    } catch (cleanup) {
      const failure = new AggregateError(
        [error, cleanup],
        "Binary operation and connection fencing failed",
        { cause: cleanup },
      );
      this.failure = failure;
      throw failure;
    }
  }
  private decode<T>(parse: () => T): T {
    try {
      return parse();
    } catch (error) {
      this.fence(error);
      throw error;
    }
  }
  private async control<T>(
    request: EntityBinaryControlRequest,
    schema: z.ZodType<T>,
    options?: EntityBinaryRequestOptions,
  ): Promise<T> {
    this.assertOpen();
    options?.signal?.throwIfAborted();
    const input = parseEntityBinaryControlRequest(request);
    const result = await this.transport.control(input, options);
    return this.decode(() => schema.parse(result));
  }
  public offer(
    size: number,
    options?: EntityBinaryRequestOptions,
  ): Promise<BinaryUploadOffer> {
    return this.control(
      { operation: "offer", size },
      binaryUploadOfferSchema,
      options,
    );
  }
  public upload(
    ticket: string,
    options?: EntityBinaryRequestOptions,
  ): Promise<BinaryUploadReceipt> {
    return this.control(
      { operation: "upload", ticket },
      binaryUploadReceiptSchema,
      options,
    );
  }
  public endpoint(
    ticket: string,
    options?: EntityBinaryRequestOptions,
  ): Promise<BinaryUploadEndpoint> {
    return this.control(
      { operation: "endpoint", ticket },
      binaryUploadEndpointSchema,
      options,
    );
  }
  public async cancel(
    ticket: string,
    options?: EntityBinaryRequestOptions,
  ): Promise<void> {
    await this.control(
      { operation: "cancel", ticket },
      cancelledSchema,
      options,
    );
  }
  public offerRead(
    ref: AssetRef,
    options?: EntityBinaryRequestOptions,
  ): Promise<BinaryReadOffer> {
    return this.control(
      { operation: "offerRead", ref },
      binaryReadOfferSchema,
      options,
    );
  }
  public download(
    ticket: string,
    options?: EntityBinaryRequestOptions,
  ): Promise<EntityBinaryReadFacts> {
    return this.control(
      { operation: "download", ticket },
      binaryReadFactsSchema,
      options,
    );
  }
  public readEndpoint(
    ticket: string,
    options?: EntityBinaryRequestOptions,
  ): Promise<BinaryReadEndpoint> {
    return this.control(
      { operation: "readEndpoint", ticket },
      binaryReadEndpointSchema,
      options,
    );
  }
  /** Retire an idle or active read. Success acknowledges native scope cleanup;
   * aborting this RPC does not, and published file output is never retracted.
   */
  public async cancelRead(
    ticket: string,
    options?: EntityBinaryRequestOptions,
  ): Promise<void> {
    await this.control(
      { operation: "cancelRead", ticket },
      cancelledSchema,
      options,
    );
  }
  /** Metadata-only file handoff. The supplied actor owner remains caller-owned;
   * await this operation during shutdown before closing the shared connection.
   */
  public async downloadFile(
    input: EntityFileDownloadInput,
    actors: EntityFileDownloadActor,
    options?: EntityBinaryRequestOptions,
  ): Promise<EntityBinaryReadFacts> {
    this.assertOpen();
    return downloadEntityFile(
      {
        offerRead: (ref): Promise<BinaryReadOffer> => this.offerRead(ref),
        download: (ticket): Promise<EntityBinaryReadFacts> =>
          this.download(ticket),
        readEndpoint: (ticket): Promise<BinaryReadEndpoint> =>
          this.readEndpoint(ticket),
        cancelRead: (ticket): Promise<void> => this.cancelRead(ticket),
        fence: (error): void => this.fence(error),
      },
      actors,
      input,
      options?.signal,
    );
  }
  public async publish(
    input: EntityPublicationRpcRequest,
    options?: EntityBinaryRequestOptions,
  ): Promise<EntityMutationResult> {
    this.assertOpen();
    options?.signal?.throwIfAborted();
    const batchScope = this.getBatchScope?.();
    const call = parseEntityBinaryPublicationCall({
      request: input,
      ...(batchScope !== undefined && { batchScope }),
    });
    const result = await this.transport.publication(call, options);
    return this.decode(() => parseEntityRpcResult(call.request, result));
  }
}
