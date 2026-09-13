// Explicit test-harness ownership of remote binary peer PROCESSES. This is separate
// from the server's bridge/credit ledger; real remote clients are not owner children.
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import { networkEndpointSchema, type NetworkEndpoint } from "./network-wire";
import {
  readEndpointSchema,
  readPauseAfterSchema,
  readPausedSchema,
} from "./network-read-protocol";
import {
  errorSchema,
  deserializeError,
} from "../../../src/turso-worker/error-protocol";
import { STAGE_BUDGET_BYTES, STAGE_CHUNK_BYTES } from "./binary-protocol";
import {
  blobFactsSchema,
  type BlobFacts,
} from "../../../src/turso-worker/blob-protocol";

const startSchema: z.ZodType<NetworkProcessStart> = z.discriminatedUnion(
  "direction",
  [
    z.strictObject({
      direction: z.literal("upload"),
      endpoint: networkEndpointSchema,
      size: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
      sourceFile: z.string().min(1).max(4096).refine(isAbsolute).optional(),
    }),
    z.strictObject({
      direction: z.literal("read"),
      endpoint: readEndpointSchema,
      facts: blobFactsSchema,
      pauseAfterBytes: readPauseAfterSchema.optional(),
    }),
  ],
);
export type NetworkProcessStart =
  | {
      direction: "upload";
      endpoint: NetworkEndpoint;
      size: number;
      sourceFile?: string | undefined;
    }
  | {
      direction: "read";
      endpoint: z.output<typeof readEndpointSchema>;
      facts: BlobFacts;
      pauseAfterBytes?: number | undefined;
    };
export type NetworkPause =
  { direction: "upload" } | ({ direction: "read" } & BlobFacts);

const messageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("runtime"),
    pid: z.number().int().positive(),
    executable: z.string().min(1).max(4096),
    sidecarUrl: z.string().min(1).max(4096),
  }),
  z.strictObject({
    kind: z.literal("credit-held"),
    pid: z.number().int().positive(),
  }),
  readPausedSchema,
  z.strictObject({
    kind: z.enum(["sealed", "consumed"]),
    pid: z.number().int().positive(),
    sizeBytes: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    kind: z.literal("failed"),
    pid: z.number().int().positive(),
    error: errorSchema,
  }),
]);
export interface NetworkProcessLease {
  pid: number;
  held: Promise<NetworkPause>;
  result: Promise<BlobFacts>;
  exited: Promise<number>;
  start: (input: NetworkProcessStart) => void;
  resume: () => void;
  /** Test-owned child only; resolves after confirmed SIGKILL exit, not the request. */
  killForProof: () => Promise<number>;
}
interface Child {
  process: ReturnType<typeof Bun.spawn>;
  exit: Promise<number>;
}
export function sidecarPath(url: URL): string {
  if (
    url.protocol !== "file:" ||
    url.hostname !== "" ||
    url.search !== "" ||
    url.hash !== ""
  )
    throw new Error("Network proof requires an explicit local sidecar URL");
  return fileURLToPath(url);
}
export class NetworkProcessOwner {
  private readonly executable: string;
  private readonly peerPath: string;
  private readonly direction: "upload" | "read";
  private readonly children = new Set<Child>();
  private closing: Promise<void> | undefined;
  private failure: unknown;
  public constructor(
    executable: string,
    peerUrl: URL,
    direction: "upload" | "read",
  ) {
    this.direction = direction;
    if (!isMainThread)
      throw new Error(
        "Network process ownership requires the harness controller",
      );
    if (!isAbsolute(executable))
      throw new Error(
        "Network proof requires an explicit absolute Bun executable",
      );
    this.executable = executable;
    this.peerPath = sidecarPath(peerUrl);
  }
  public stats(): { children: number; fenced: boolean } {
    return {
      children: this.children.size,
      fenced: this.failure !== undefined || this.closing !== undefined,
    };
  }
  public spawn(): NetworkProcessLease {
    if (this.closing || this.failure !== undefined)
      throw new Error("Network process owner is fenced", {
        cause: this.failure,
      });
    if (this.children.size >= 2)
      throw new Error("Network peer process capacity exceeded");
    const held = Promise.withResolvers<NetworkPause>();
    const result = Promise.withResolvers<BlobFacts>();
    void held.promise.catch(() => undefined); // Observed by held-credit acceptance; result also carries startup failure.
    void result.promise.catch(() => undefined); // Observed by the transfer and close/error paths.
    let started = false;
    let runtimeObserved = false;
    let paused = false;
    let resumed = false;
    let terminal = false;
    let killing: Promise<number> | undefined;
    let expectedSize = 0;
    let expectedPause = 0;
    let expectedDigest: string | undefined;
    const reject = (error: unknown): void => {
      held.reject(error);
      result.reject(error);
    };
    const process = Bun.spawn([this.executable, this.peerPath], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      ipc: (input: unknown): void => {
        try {
          const message = messageSchema.parse(input);
          if (
            !started ||
            terminal ||
            message.pid !== process.pid ||
            message.pid === globalThis.process.pid
          )
            throw new Error("Invalid network peer identity or phase");
          if (message.kind === "runtime") {
            if (
              runtimeObserved ||
              message.executable !== this.executable ||
              sidecarPath(new URL(message.sidecarUrl)) !== this.peerPath
            )
              throw new Error("Unexpected network peer executable or sidecar");
            runtimeObserved = true;
            return;
          }
          if (!runtimeObserved)
            throw new Error("Network peer skipped its runtime handshake");
          if (message.kind === "credit-held" || message.kind === "chunk-held") {
            if (
              message.kind !==
              (this.direction === "upload" ? "credit-held" : "chunk-held")
            )
              throw new Error("Network peer pause has the wrong direction");
            if (paused) throw new Error("Repeated network peer pause");
            if (message.kind === "chunk-held") {
              if (message.sizeBytes !== expectedPause)
                throw new Error(
                  "Network read paused at an unexpected byte count",
                );
              if (
                message.sizeBytes === expectedSize &&
                message.sha256 !== expectedDigest
              )
                throw new Error("Network read full-prefix digest mismatch");
              held.resolve({
                direction: "read",
                sizeBytes: message.sizeBytes,
                sha256: message.sha256,
              });
            } else held.resolve({ direction: "upload" });
            paused = true;
          } else {
            terminal = true;
            if (message.kind === "failed")
              reject(deserializeError(message.error));
            else {
              if (
                !paused ||
                !resumed ||
                message.kind !==
                  (this.direction === "upload" ? "sealed" : "consumed")
              )
                throw new Error(
                  "Network peer completion has the wrong direction or phase",
                );
              if (message.sizeBytes !== expectedSize)
                throw new Error("Network peer completed an unexpected size");
              result.resolve({
                sizeBytes: message.sizeBytes,
                sha256: message.sha256,
              });
            }
          }
        } catch (error) {
          this.failure ??= error;
          reject(error);
        }
      },
    });
    const child: Child = { process, exit: process.exited };
    this.children.add(child); // No await between admission, spawn and exit binding.
    void child.exit.then(
      (code) => {
        this.children.delete(child);
        reject(
          new Error(
            `Network peer exited without the expected response (code ${code}; ${this.peerPath})`,
          ),
        );
      },
      (error: unknown) => {
        this.failure ??= error;
        reject(error);
      },
    );
    return {
      pid: process.pid,
      held: held.promise,
      result: result.promise,
      exited: child.exit,
      start: (input): void => {
        if (
          started ||
          killing ||
          this.closing ||
          this.failure !== undefined ||
          child.process.exitCode !== null
        )
          throw new Error("Network peer bootstrap is not available");
        const options = startSchema.parse(input);
        if (options.direction !== this.direction)
          throw new Error("Network peer bootstrap has the wrong direction");
        expectedSize =
          options.direction === "upload"
            ? options.size
            : options.facts.sizeBytes;
        if (options.direction === "read") {
          expectedPause = Math.min(
            expectedSize,
            options.pauseAfterBytes ?? STAGE_CHUNK_BYTES,
          );
          expectedDigest = options.facts.sha256;
        }
        started = true;
        process.send(
          options.direction === "upload"
            ? {
                endpoint: options.endpoint,
                size: options.size,
                ...(options.sourceFile !== undefined && {
                  sourceFile: options.sourceFile,
                }),
                pause: true,
                fragment: true,
              }
            : {
                endpoint: options.endpoint,
                facts: options.facts,
                pause: true,
                fragmentAck: true,
                pauseAfterBytes: options.pauseAfterBytes ?? STAGE_CHUNK_BYTES,
              },
        );
      },
      killForProof: (): Promise<number> => {
        killing ??= (async (): Promise<number> => {
          try {
            if (child.process.exitCode !== null)
              throw new Error("Network peer already exited before proof kill");
            this.requestTermination(() => child.process.kill("SIGKILL"));
            const code = await child.exit;
            if (child.process.signalCode !== "SIGKILL")
              throw new Error("Network peer did not exit from SIGKILL");
            return code;
          } catch (error) {
            this.failure ??= error;
            throw error;
          }
        })();
        return killing;
      },
      resume: (): void => {
        if (
          killing ||
          this.closing ||
          this.failure !== undefined ||
          child.process.exitCode !== null ||
          !paused ||
          resumed ||
          terminal
        )
          throw new Error("Network peer has no held credit");
        resumed = true;
        process.send({ kind: "resume" });
      },
    };
  }
  public close(): Promise<void> {
    this.closing ??= this.finishClose();
    return this.closing;
  }
  protected requestTermination(request: () => void): void {
    request();
  }
  private async finishClose(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.children].map(async (child) => {
        // A kill request alone is not join. A failed request remains represented
        // by the retained child/exit observer and fences this owner, without retry.
        if (child.process.exitCode === null)
          this.requestTermination(() => child.process.kill());
        await child.exit;
      }),
    );
    const errors: unknown[] = [];
    for (const result of results)
      if (result.status === "rejected") errors.push(result.reason);
    if (errors.length > 0) {
      const cleanup = new AggregateError(
        errors,
        "Network peer exits could not be confirmed",
        { cause: errors[0] },
      );
      this.failure =
        this.failure === undefined
          ? cleanup
          : new AggregateError(
              [this.failure, cleanup],
              "Network peer protocol and shutdown failed",
              { cause: cleanup },
            );
      throw this.failure;
    }
    if (this.failure !== undefined) throw this.failure;
  }
}
