import { isMainThread, type MessagePort } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { STAGE_CHUNK_BYTES, type SealedStage } from "./binary-protocol";
import {
  serializeError,
  deserializeError,
} from "../../../src/turso-worker/error-protocol";
import { TRANSFER_SLOTS } from "./transfer-budget";
import { readInputSchema } from "./read-protocol";
import type { UploadGrant, UploadResult } from "./upload-protocol";
import type { ReadSnapshots } from "./read-snapshots";

interface Stream {
  read: number;
  cancel: () => void;
  closed: Promise<void>;
}
/** Pulls copy only immutable, already-materialized bytes. No owner/SQL API here. */
export class DirectReads {
  private readonly reads: ReadSnapshots;
  private readonly pool: string;
  private readonly announce: (id: string, result: UploadResult) => void;
  private readonly active = new Map<string, Stream>();
  private readonly handled = new WeakSet<MessagePort>();
  private closing = false;
  public constructor(
    reads: ReadSnapshots,
    pool: string,
    announce: (id: string, result: UploadResult) => void,
  ) {
    if (isMainThread)
      throw new Error("Direct reads require an execution worker");
    this.reads = reads;
    this.pool = pool;
    this.announce = announce;
  }
  public reject(grant: UploadGrant, port: MessagePort, error: unknown): void {
    if (this.handled.has(port)) return;
    this.handled.add(port);
    port.once("close", () =>
      this.announce(grant.id, { kind: "error", error: serializeError(error) }),
    );
    port.close();
  }
  public open(grant: UploadGrant, port: MessagePort): void {
    this.handled.add(port);
    const done = Promise.withResolvers<void>();
    let facts: SealedStage | undefined;
    let result: UploadResult | undefined;
    let closing = false;
    let used = false;
    let offset = 0;
    let sequence = 0;
    let credit = "";
    const fail = (error: unknown): void => {
      if (result?.kind !== "error")
        result = { kind: "error", error: serializeError(error) };
      if (!closing) {
        closing = true;
        port.postMessage(result);
        port.close();
      }
    };
    port.once("close", () =>
      queueMicrotask(() => {
        if (facts) this.active.delete(grant.id);
        try {
          result ??= {
            kind: "error",
            error: serializeError(
              new Error("Read consumer closed before completion"),
            ),
          };
          if (facts) {
            try {
              this.reads.control(
                { action: "discard", capability: grant.stage },
                0,
              );
            } catch (cleanup) {
              result = {
                kind: "error",
                error: serializeError(
                  new AggregateError(
                    [
                      ...(result.kind === "error"
                        ? [deserializeError(result.error)]
                        : []),
                      cleanup,
                    ],
                    "Read stream cleanup failed",
                    { cause: cleanup },
                  ),
                ),
              };
            }
          }
          this.announce(grant.id, result);
        } finally {
          done.resolve();
        }
      }),
    );
    const send = (bytes: ArrayBuffer): void => {
      const size = this.reads.copy(grant.stage, offset, new Uint8Array(bytes));
      offset += size;
      credit = randomUUID();
      port.postMessage({ kind: "chunk", sequence, credit, size, bytes }, [
        bytes,
      ]);
      if (bytes.byteLength !== 0) {
        const error = new Error("Read credit ownership was not transferred");
        queueMicrotask(() => {
          throw error;
        });
        throw error;
      }
    };
    port.on("message", (input: unknown) => {
      if (closing) return;
      try {
        const message = readInputSchema.parse(input);
        if (message.kind === "hello") {
          const candidate = message.grant;
          if (
            used ||
            candidate.direction !== "read" ||
            candidate.id !== grant.id ||
            candidate.pool !== this.pool ||
            candidate.stage.generation !== grant.stage.generation ||
            candidate.stage.scope !== grant.stage.scope ||
            candidate.stage.id !== grant.stage.id
          )
            throw new Error("Foreign or spent read grant");
          used = true;
          send(new ArrayBuffer(STAGE_CHUNK_BYTES));
          return;
        }
        if (
          !used ||
          message.sequence !== sequence ||
          message.credit !== credit ||
          !facts
        )
          throw new Error("Invalid read credit sequence");
        if (offset === facts.sizeBytes) {
          result = { kind: "sealed", facts };
          closing = true;
          port.postMessage(result);
          port.close();
        } else {
          sequence++;
          send(message.bytes);
        }
      } catch (error) {
        fail(error);
      }
    });
    port.on("messageerror", (error: unknown) => fail(error));
    try {
      if (
        this.closing ||
        this.active.size >= TRANSFER_SLOTS ||
        this.active.has(grant.id)
      )
        throw new Error("Read stream capacity exceeded or closing");
      if (grant.pool !== this.pool || grant.direction !== "read")
        throw new Error("Foreign read transfer grant");
      facts = this.reads.claim(grant.stage);
      this.active.set(grant.id, {
        read: grant.stage.id,
        cancel: (): void => fail(new Error("Read scope revoked")),
        closed: done.promise,
      });
    } catch (error) {
      fail(error);
      throw error;
    }
  }
  public async cancel(id: string): Promise<void> {
    const stream = this.active.get(id);
    stream?.cancel();
    await stream?.closed;
  }
  public revoke(id: number): void {
    for (const stream of this.active.values())
      if (stream.read === id) stream.cancel();
  }
  public async close(): Promise<void> {
    this.closing = true;
    const streams = [...this.active.values()];
    for (const stream of streams) stream.cancel();
    await Promise.all(streams.map((stream) => stream.closed));
  }
}
