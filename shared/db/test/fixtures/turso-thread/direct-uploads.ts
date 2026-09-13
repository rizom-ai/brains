import { isMainThread, type MessagePort } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { STAGE_CHUNK_BYTES, sealedSchema } from "./binary-protocol";
import {
  serializeError,
  deserializeError,
} from "../../../src/turso-worker/error-protocol";
import { TRANSFER_SLOTS } from "./transfer-budget";
import {
  uploadInputSchema,
  type UploadGrant,
  type UploadResult,
} from "./upload-protocol";
import type { StagedBinaries } from "./staged-binaries";

interface Upload {
  stage: number;
  cancel: () => void;
  closed: Promise<void>;
}
/** No SQL surface. All allocation, visible-byte copying and hashing stay here. */
export class DirectUploads {
  private readonly stages: StagedBinaries;
  private readonly pool: string;
  private readonly announce: (id: string, result: UploadResult) => void;
  private readonly active = new Map<string, Upload>();
  private closing = false;
  private readonly handled = new WeakSet<MessagePort>();
  public constructor(
    stages: StagedBinaries,
    pool: string,
    announce: (id: string, result: UploadResult) => void,
  ) {
    if (isMainThread)
      throw new Error("Direct uploads require an execution worker");
    this.stages = stages;
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
    let ownedStage = false;
    let used = false;
    let closing = false;
    let processing = false;
    let sequence = 0;
    let credit = "";
    let offset = 0;
    let result: UploadResult | undefined;
    const fail = (error: unknown): void => {
      if (result?.kind !== "error")
        result = { kind: "error", error: serializeError(error) };
      if (!closing) {
        closing = true;
        port.postMessage(result);
        port.close();
      }
    };
    // Defer even a synchronous port-close notification past the payload handler,
    // so its returned buffer/view references are no longer live at settlement.
    port.once("close", () =>
      queueMicrotask(() => {
        if (ownedStage) this.active.delete(grant.id);
        try {
          if (
            result?.kind === "sealed" &&
            !this.stages.finishUpload(grant.stage, grant.id)
          )
            result = undefined;
          result ??= {
            kind: "error",
            error: serializeError(
              new Error("Direct upload closed before completion"),
            ),
          };
          if (result.kind === "error" && ownedStage) {
            try {
              this.stages.execute(
                {
                  action: "discard",
                  scope: grant.stage.scope,
                  capability: grant.stage,
                },
                0,
              );
            } catch (cleanup) {
              result = {
                kind: "error",
                error: serializeError(
                  new AggregateError(
                    [deserializeError(result.error), cleanup],
                    "Direct upload and stage cleanup failed",
                    { cause: cleanup },
                  ),
                ),
              };
            }
          }
          this.announce(grant.id, result);
        } finally {
          if (ownedStage) this.active.delete(grant.id);
          done.resolve();
        }
      }),
    );
    const sendCredit = (bytes: ArrayBuffer): void => {
      credit = randomUUID();
      port.postMessage({ kind: "credit", sequence, credit, bytes }, [bytes]);
      if (bytes.byteLength !== 0) {
        const error = new Error(
          "Direct upload credit ownership was not transferred",
        );
        // Unsupported ownership semantics are fatal, not successful cancellation.
        queueMicrotask(() => {
          throw error;
        });
        throw error;
      }
    };
    port.on("message", (input: unknown) => {
      if (closing) return;
      try {
        processing = true;
        const message = uploadInputSchema.parse(input);
        if (message.kind === "hello") {
          const candidate = message.grant;
          if (
            used ||
            candidate.id !== grant.id ||
            candidate.direction !== "upload" ||
            candidate.pool !== this.pool ||
            candidate.stage.generation !== grant.stage.generation ||
            candidate.stage.scope !== grant.stage.scope ||
            candidate.stage.id !== grant.stage.id
          )
            throw new Error("Foreign or spent upload grant");
          used = true;
          sendCredit(new ArrayBuffer(STAGE_CHUNK_BYTES));
          return;
        }
        if (!used || message.sequence !== sequence || message.credit !== credit)
          throw new Error("Invalid direct upload credit sequence");
        if (message.kind === "chunk") {
          this.stages.appendBytes(
            grant.stage.scope,
            grant.stage,
            offset,
            new Uint8Array(message.bytes, 0, message.size),
            grant.id,
          );
          offset += message.size;
          sequence++;
          sendCredit(message.bytes);
        } else {
          const facts = sealedSchema.parse(
            this.stages.execute(
              {
                action: "seal",
                scope: grant.stage.scope,
                capability: grant.stage,
              },
              0,
              grant.id,
            ),
          );
          result = { kind: "sealed", facts };
          closing = true;
          port.postMessage(result);
          port.close(); // Returned credit is no longer retained after this handler.
        }
      } catch (error) {
        fail(error);
      } finally {
        processing = false;
      }
    });
    port.on("messageerror", (error: unknown) => fail(error));
    try {
      if (
        this.closing ||
        this.active.size >= TRANSFER_SLOTS ||
        this.active.has(grant.id)
      )
        throw new Error("Direct upload capacity exceeded or closing");
      if (grant.pool !== this.pool || grant.direction !== "upload")
        throw new Error("Foreign direct upload pool");
      this.stages.openUpload(grant.stage, grant.id);
      ownedStage = true;
      this.active.set(grant.id, {
        stage: grant.stage.id,
        cancel: (): void => {
          if (!processing) fail(new Error("Direct upload scope revoked"));
        },
        closed: done.promise,
      });
    } catch (error) {
      fail(error);
      throw error;
    }
  }
  public async cancel(id: string): Promise<void> {
    const upload = this.active.get(id);
    upload?.cancel();
    await upload?.closed;
  }
  public revoke(stage: number): void {
    for (const upload of this.active.values())
      if (upload.stage === stage) upload.cancel();
  }
  public async close(): Promise<void> {
    this.closing = true;
    const uploads = [...this.active.values()];
    for (const upload of uploads) upload.cancel();
    await Promise.all(uploads.map((upload) => upload.closed));
  }
}
