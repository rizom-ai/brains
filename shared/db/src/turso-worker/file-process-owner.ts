import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "@brains/utils/zod";
import { fileUploadSchema, type FileUploadInput } from "./file-upload";
import { fileDownloadSchema, type FileDownloadInput } from "./file-download";
import { blobFactsSchema, type BlobFacts } from "./blob-protocol";
import { errorSchema, deserializeError } from "./error-protocol";
import { fileFetchSchema, type FileFetchInput } from "./file-fetch";
import { fileProduceSchema, type FileProduceInput } from "./file-produce";

export type { FileUploadInput } from "./file-upload";
export type { FileDownloadInput } from "./file-download";
export type { BlobFacts } from "./blob-protocol";

const detailsSchema = z
  .record(
    z.string().max(64),
    z.union([z.string().max(1024), z.number().finite(), z.boolean()]),
  )
  .refine((details) => Object.keys(details).length <= 16);
export interface FileInspectionResult extends BlobFacts {
  details: Record<string, string | number | boolean>;
}

const messageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("runtime"),
    pid: z.number().int().positive(),
    executable: z.string().min(1).max(4096),
    sidecarUrl: z.string().min(1).max(4096),
  }),
  blobFactsSchema.extend({
    kind: z.enum(["sealed", "consumed"]),
    pid: z.number().int().positive(),
    details: detailsSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("failed"),
    pid: z.number().int().positive(),
    error: errorSchema,
  }),
]);
export interface FileProcessOwnerOptions {
  /** Explicit external Bun, including for installed compiled controllers. No PATH fallback. */
  executable: string;
  uploadUrl: URL;
  downloadUrl: URL;
  inspectionUploadUrl?: URL;
  remoteDownloadUrl?: URL;
  producerUrl?: URL;
}
interface Child {
  readonly terminal: boolean;
  stop(error: unknown): void;
  exited: Promise<number>;
}
function actorPath(url: URL): string {
  if (
    url.protocol !== "file:" ||
    url.hostname !== "" ||
    url.search !== "" ||
    url.hash !== ""
  )
    throw new Error("File actor requires an explicit local URL");
  return fileURLToPath(url);
}
/** Creator-owned file actors. Controllers exchange metadata only. Two child slots
 * are charged before spawn and held through actual exit. Abort terminates the actor;
 * it does not retract output or acknowledge remote/native authority retirement.
 */
export class FileProcessOwner {
  private readonly executable: string;
  private readonly uploadPath: string;
  private readonly downloadPath: string;
  private readonly inspectionPath: string | undefined;
  private readonly remotePath: string | undefined;
  private readonly producerPath: string | undefined;
  private producing = false;
  private readonly children = new Set<Child>();
  private admissions = 0;
  private failure: unknown;
  private closing: Promise<void> | undefined;
  public constructor(options: FileProcessOwnerOptions) {
    if (!isAbsolute(options.executable))
      throw new Error(
        "File actor requires an explicit absolute Bun executable",
      );
    if (
      Bun.main.startsWith("/$bunfs/") &&
      options.executable === process.execPath
    )
      throw new Error(
        "Compiled file controllers require an external Bun executable",
      );
    this.producerPath = options.producerUrl
      ? actorPath(options.producerUrl)
      : undefined;
    this.remotePath = options.remoteDownloadUrl
      ? actorPath(options.remoteDownloadUrl)
      : undefined;
    this.executable = options.executable;
    this.uploadPath = actorPath(options.uploadUrl);
    this.downloadPath = actorPath(options.downloadUrl);
    this.inspectionPath = options.inspectionUploadUrl
      ? actorPath(options.inspectionUploadUrl)
      : undefined;
  }
  public stats(): {
    children: number;
    terminalChildren: number;
    fenced: boolean;
  } {
    return {
      children: this.admissions,
      terminalChildren: [...this.children].filter((child) => child.terminal)
        .length,
      fenced: this.closing !== undefined || this.failure !== undefined,
    };
  }
  public async upload(
    input: FileUploadInput,
    signal?: AbortSignal,
  ): Promise<BlobFacts> {
    const options = fileUploadSchema.parse(input);
    return this.run(
      this.uploadPath,
      "sealed",
      options,
      options.size,
      undefined,
      signal,
    );
  }
  public async download(
    input: FileDownloadInput,
    signal?: AbortSignal,
  ): Promise<BlobFacts> {
    const options = fileDownloadSchema.parse(input);
    return this.run(
      this.downloadPath,
      "consumed",
      options,
      options.facts.sizeBytes,
      options.facts.sha256,
      signal,
    );
  }
  public async inspectUpload(
    input: FileUploadInput,
    signal?: AbortSignal,
  ): Promise<FileInspectionResult> {
    if (!this.inspectionPath)
      throw new Error("File inspection actor is not provisioned");
    const options = fileUploadSchema.parse(input);
    const result = await this.run(
      this.inspectionPath,
      "sealed",
      options,
      options.size,
      undefined,
      signal,
    );
    if (!result.details) {
      const error = new Error("File inspection actor returned no metadata");
      this.fence(error);
      throw error;
    }
    return { ...result, details: result.details };
  }
  public async fetch(
    input: FileFetchInput,
    signal?: AbortSignal,
  ): Promise<FileInspectionResult> {
    if (!this.remotePath)
      throw new Error("Remote image actor is not provisioned");
    const result = await this.run(
      this.remotePath,
      "consumed",
      fileFetchSchema.parse(input),
      undefined,
      undefined,
      signal,
    );
    if (!result.details) {
      const error = new Error("Remote image actor returned no metadata");
      this.fence(error);
      throw error;
    }
    return { ...result, details: result.details };
  }
  /** At most one bulk SDK producer, within the existing two-child admission.
   * The reservation is held through actual Bun actor exit, not terminal metadata.
   */
  public async produce(
    input: FileProduceInput,
    signal?: AbortSignal,
  ): Promise<BlobFacts> {
    if (!this.producerPath)
      throw new Error("File producer actor is not provisioned");
    const options = fileProduceSchema.parse(input);
    signal?.throwIfAborted();
    if (this.producing) throw new Error("File production capacity exceeded");
    this.producing = true;
    try {
      return await this.run(
        this.producerPath,
        "consumed",
        options,
        undefined,
        undefined,
        signal,
      );
    } finally {
      this.producing = false;
    }
  }
  private fence(error: unknown): void {
    this.failure ??= error;
    for (const child of this.children) child.stop(error);
  }
  private async run(
    path: string,
    kind: "sealed" | "consumed",
    input:
      FileUploadInput | FileDownloadInput | FileFetchInput | FileProduceInput,
    size: number | undefined,
    digest: string | undefined,
    signal?: AbortSignal,
  ): Promise<BlobFacts & { details?: FileInspectionResult["details"] }> {
    if (this.closing || this.failure !== undefined)
      throw new Error("File process owner is fenced", { cause: this.failure });
    signal?.throwIfAborted();
    if (this.admissions >= 2) throw new Error("File process capacity exceeded");
    this.admissions++;
    let charged = true;
    const errors: unknown[] = [];
    const remember = (error: unknown): void => {
      if (!errors.includes(error)) errors.push(error);
    };
    const state: {
      runtime: boolean;
      terminal: boolean;
      stopping: boolean;
      facts:
        (BlobFacts & { details?: FileInspectionResult["details"] }) | undefined;
    } = { runtime: false, terminal: false, stopping: false, facts: undefined };
    let child: Child | undefined;
    let abort: (() => void) | undefined;
    try {
      const process = Bun.spawn([this.executable, path], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "inherit",
        ipc: (value: unknown): void => {
          try {
            const message = messageSchema.parse(value);
            if (
              message.pid !== process.pid ||
              message.pid === globalThis.process.pid
            )
              throw new Error("Invalid file actor identity or phase");
            if (state.stopping) {
              if (message.kind === "failed")
                remember(deserializeError(message.error));
              return; // Late metadata cannot establish success, but cleanup causes remain visible.
            }
            if (state.terminal)
              throw new Error("Repeated file actor completion");
            if (message.kind === "runtime") {
              if (
                state.runtime ||
                message.executable !== this.executable ||
                actorPath(new URL(message.sidecarUrl)) !== path
              )
                throw new Error("Unexpected file actor executable or artifact");
              state.runtime = true;
            } else {
              if (!state.runtime)
                throw new Error("File actor skipped its runtime handshake");
              state.terminal = true;
              if (message.kind === "failed")
                remember(deserializeError(message.error));
              else {
                if (
                  message.kind !== kind ||
                  (size !== undefined && message.sizeBytes !== size) ||
                  (digest !== undefined && message.sha256 !== digest)
                )
                  throw new Error(
                    "File actor completion does not match its request",
                  );
                state.facts = {
                  sizeBytes: message.sizeBytes,
                  sha256: message.sha256,
                  ...(message.details && { details: message.details }),
                };
              }
            }
          } catch (error) {
            remember(error);
            this.fence(error);
          }
        },
      });
      child = {
        get terminal(): boolean {
          return state.terminal;
        },
        exited: process.exited,
        stop: (error): void => {
          if (state.stopping) return;
          state.stopping = true;
          remember(error);
          try {
            if (process.exitCode === null) process.kill("SIGTERM");
          } catch (cleanup) {
            remember(cleanup);
            this.failure =
              this.failure === undefined
                ? cleanup
                : new AggregateError(
                    [this.failure, cleanup],
                    "File actor fencing and termination failed",
                    { cause: cleanup },
                  );
            // Retain the child and await actual exit even if termination failed.
          }
        },
      };
      this.children.add(child);
      abort = (): void =>
        child?.stop(signal?.reason ?? new Error("File transfer cancelled"));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      try {
        if (!state.stopping) process.send(input);
      } catch (error) {
        this.fence(error);
      }
      let code: number;
      try {
        code = await child.exited;
      } catch (error) {
        remember(error);
        this.fence(error);
        if (errors.length > 1)
          throw new AggregateError(
            errors,
            "File transfer and exit acknowledgement failed",
            { cause: error },
          );
        throw error;
      }
      this.children.delete(child);
      this.admissions--;
      charged = false;
      child = undefined;
      if (
        !state.stopping &&
        (!state.terminal ||
          process.signalCode !== null ||
          (code !== 0 && errors.length === 0))
      ) {
        const error = new Error(
          `File actor exited without acknowledged completion (code ${code}; ${path})`,
        );
        remember(error);
        this.fence(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          "File transfer and actor cleanup failed",
          { cause: errors[0] },
        );
      if (!state.facts)
        throw new Error("File actor produced no completion facts");
      return state.facts;
    } finally {
      if (abort) signal?.removeEventListener("abort", abort);
      // A spawn failure has no child to join. An unconfirmed exit retains its slot.
      if (!child && charged) this.admissions--;
    }
  }
  public close(): Promise<void> {
    this.closing ??= this.finishClose();
    return this.closing;
  }
  private async finishClose(): Promise<void> {
    const children = [...this.children];
    for (const child of children)
      child.stop(new Error("File process owner closed"));
    const results = await Promise.allSettled(
      children.map((child) => child.exited),
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (this.failure !== undefined && !errors.includes(this.failure))
      errors.unshift(this.failure);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "File actor exits could not be confirmed",
        { cause: errors[0] },
      );
  }
}
