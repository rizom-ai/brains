import { isAbsolute, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { remoteUrlSchema } from "@brains/db/file-fetch";
import { fileProducePathSchema } from "@brains/db/file-produce";
import { z } from "@brains/utils/zod";
import {
  binaryUploadSizeSchema,
  type BinaryUploadReceipt,
} from "@brains/db/binary-publication";
import {
  FileProcessOwner,
  type FileProcessOwnerOptions,
  type FileInspectionResult,
} from "@brains/db/file-process-owner";
import type {
  EntityBinaryClient,
  EntityBinaryRequestOptions,
} from "./entity-binary-client";
import type { FileUploadInput } from "@brains/db/file-upload";
import type { EntityFilePublicationInput } from "./entity-file-publication";
import type { EntityFileDownloadInput } from "./entity-file-download";
import type { EntityMutationResult } from "./types";
/** Caller-trusted absolute file location, not a filesystem authorization token. */
export interface EntityFileSource {
  sourceFile: string;
  sizeBytes: number;
}
export interface EntityFileInspectionOptions extends EntityBinaryRequestOptions {
  /** Select an explicitly provisioned inspection artifact. No default fallback. */
  inspector?: string;
}
export interface EntityFileAssets {
  /** Lend actor-produced output after actual Bun exit. Failed staging is retained.
   * Caller keeps the input directory alive through settlement and joins consumers.
   * The producer artifact is explicitly provisioned; no controller byte fallback.
   */
  withProducedFile?<T>(
    sourceDirectory: string,
    use: (
      file: EntityFileSource & { sha256: string },
      signal: AbortSignal,
    ) => Promise<T>,
    options?: EntityBinaryRequestOptions,
  ): Promise<T>;
  /** Join all consumers before returning. Success removes staging; failure retains it. */
  withRemoteFile?<T>(
    url: string,
    use: (
      file: EntityFileSource & FileInspectionResult,
      signal: AbortSignal,
    ) => Promise<T>,
    options?: EntityBinaryRequestOptions,
  ): Promise<T>;
  inspect(
    input: EntityFileSource,
    options?: EntityFileInspectionOptions,
  ): Promise<FileInspectionResult>;
  /** Actor-local file hashing with native verification and acknowledged transient retirement. */
  fingerprint(
    input: EntityFileSource,
    options?: EntityBinaryRequestOptions,
  ): Promise<{ sizeBytes: number; sha256: string }>;
  publish(
    input: EntityFilePublicationInput,
    options?: EntityBinaryRequestOptions,
  ): Promise<EntityMutationResult>;
  download(
    input: EntityFileDownloadInput,
    options?: EntityBinaryRequestOptions,
  ): Promise<{ sizeBytes: number; sha256: string }>;
  close(): Promise<void>;
}
export type EntityFileActorOptions = FileProcessOwnerOptions & {
  inspectionUploadUrl: URL;
};
export const entityFileSourceSchema: z.ZodType<EntityFileSource> =
  z.strictObject({
    sourceFile: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => isAbsolute(value) && !value.includes("\0")),
    sizeBytes: binaryUploadSizeSchema,
  });
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
async function observe<T>(operation: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error };
  }
}
/** Shell-provisioned file actors. Inspection uses an admitted transient upload,
 * then retires it; durable publication re-uploads and checks the inspected digest.
 * No staged authority or bytes survive in directory-sync's raw entity records.
 */
export class EntityFileRuntime implements EntityFileAssets {
  private readonly actors: FileProcessOwner;
  private readonly client: EntityBinaryClient;
  private readonly closeControl: (() => void) | undefined;
  private readonly operations = new Map<AbortController, Promise<unknown>>();
  private closed = false;
  private closing: Promise<void> | undefined;
  public constructor(
    client: EntityBinaryClient,
    options: EntityFileActorOptions,
    closeControl?: () => void,
  ) {
    this.client = client;
    this.actors = new FileProcessOwner(options);
    this.closeControl = closeControl;
  }
  private run<T>(
    body: (signal: AbortSignal) => Promise<T>,
    caller?: AbortSignal,
  ): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error("File runtime is closing"));
    if (caller?.aborted) return Promise.reject(caller.reason);
    if (this.operations.size >= 16)
      return Promise.reject(
        new Error("File operation admission capacity exceeded"),
      );
    const abort = new AbortController();
    const cancelled = (): void => abort.abort(caller?.reason);
    caller?.addEventListener("abort", cancelled, { once: true });
    // Observe the body's real outcome: a late abort cannot retract publication.
    const work = Promise.resolve()
      .then(() => body(abort.signal))
      .finally(() => {
        caller?.removeEventListener("abort", cancelled);
        this.operations.delete(abort);
      });
    this.operations.set(abort, work);
    return work;
  }
  public withRemoteFile<T>(
    url: string,
    use: (
      file: EntityFileSource & FileInspectionResult,
      signal: AbortSignal,
    ) => Promise<T>,
    options?: EntityBinaryRequestOptions,
  ): Promise<T> {
    return this.run(async (signal): Promise<T> => {
      const source = remoteUrlSchema.parse(url);
      signal.throwIfAborted();
      const directory = await mkdtemp(join(tmpdir(), "turso-remote-image-"));
      const sourceFile = join(directory, "verified");
      const facts = await this.actors.fetch(
        { url: source, outputFile: sourceFile },
        signal,
      );
      signal.throwIfAborted();
      const result = await use({ sourceFile, ...facts }, signal);
      // No post-publication abort check: acknowledge cleanup, not retraction.
      await rm(directory, { recursive: true });
      return result;
    }, options?.signal);
  }
  public withProducedFile<T>(
    sourceDirectory: string,
    use: (
      file: EntityFileSource & { sha256: string },
      signal: AbortSignal,
    ) => Promise<T>,
    options?: EntityBinaryRequestOptions,
  ): Promise<T> {
    return this.run(async (signal): Promise<T> => {
      const source = fileProducePathSchema.parse(sourceDirectory);
      signal.throwIfAborted();
      const directory = await mkdtemp(join(tmpdir(), "turso-produced-file-"));
      const sourceFile = join(directory, "verified");
      const facts = await this.actors.produce(
        { sourceDirectory: source, outputFile: sourceFile },
        signal,
      );
      signal.throwIfAborted();
      const result = await use({ sourceFile, ...facts }, signal);
      await rm(directory, { recursive: true });
      return result;
    }, options?.signal);
  }
  public publish(
    input: EntityFilePublicationInput,
    options?: EntityBinaryRequestOptions,
  ): Promise<EntityMutationResult> {
    return this.run(
      (signal) => this.client.publishFile(input, this.actors, { signal }),
      options?.signal,
    );
  }
  public download(
    input: EntityFileDownloadInput,
    options?: EntityBinaryRequestOptions,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    return this.run(
      (signal) => this.client.downloadFile(input, this.actors, { signal }),
      options?.signal,
    );
  }
  public inspect(
    input: EntityFileSource,
    options?: EntityFileInspectionOptions,
  ): Promise<FileInspectionResult> {
    return this.run((signal) => {
      this.actors.assertInspectionAvailable(options?.inspector);
      return this.inspectOwned(input, signal, (source, abort) =>
        this.actors.inspectUpload(source, abort, options?.inspector),
      );
    }, options?.signal);
  }
  public fingerprint(
    input: EntityFileSource,
    options?: EntityBinaryRequestOptions,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    return this.run(
      (signal) =>
        this.inspectOwned(input, signal, (source, abort) =>
          this.actors.upload(source, abort),
        ),
      options?.signal,
    );
  }
  private async inspectOwned<T extends { sizeBytes: number; sha256: string }>(
    input: EntityFileSource,
    signal: AbortSignal,
    upload: (source: FileUploadInput, abort: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const parsed = entityFileSourceSchema.parse(input);
    signal.throwIfAborted();
    const offered = await observe(() => this.client.offer(parsed.sizeBytes));
    if (!offered.ok) {
      const failure =
        signal.aborted && signal.reason !== offered.error
          ? new AggregateError(
              [signal.reason, offered.error],
              "Cancelled inspection has no offer receipt",
              { cause: signal.reason },
            )
          : offered.error;
      this.client.invalidate(failure);
      throw failure;
    }
    const offer = offered.value;
    const abort = new AbortController();
    const errors: unknown[] = [];
    const remember = (error: unknown): void => {
      if (!errors.includes(error)) errors.push(error);
    };
    let cleanup: Promise<Outcome<void>> | undefined;
    let native: Promise<Outcome<BinaryUploadReceipt>> | undefined;
    let actor: Promise<Outcome<T>> | undefined;
    let facts: T | undefined;
    const retire = (): void => {
      cleanup ??= observe(() => this.client.cancel(offer.ticket));
    };
    const stop = (error: unknown): void => {
      remember(error);
      abort.abort(error);
      retire();
    };
    const cancelled = (): void => stop(signal.reason);
    signal.addEventListener("abort", cancelled, { once: true });
    try {
      signal.throwIfAborted();
      native = observe(() => this.client.upload(offer.ticket)).then(
        (result): Outcome<BinaryUploadReceipt> => {
          if (!result.ok) stop(result.error);
          return result;
        },
      );
      const endpoint = await this.client.endpoint(offer.ticket);
      abort.signal.throwIfAborted();
      actor = observe(() =>
        upload(
          { sourceFile: parsed.sourceFile, size: parsed.sizeBytes, endpoint },
          abort.signal,
        ),
      ).then((result): Outcome<T> => {
        if (!result.ok) stop(result.error);
        return result;
      });
      const [sealed, inspected] = await Promise.all([native, actor]);
      if (sealed.ok && inspected.ok) {
        if (
          sealed.value.sha256 !== inspected.value.sha256 ||
          sealed.value.sizeBytes !== inspected.value.sizeBytes ||
          inspected.value.sizeBytes !== parsed.sizeBytes
        )
          throw new Error("File verification receipt mismatch");
        facts = inspected.value;
      }
    } catch (error) {
      stop(error);
    } finally {
      await Promise.all([native, actor]);
      retire();
      const retired = await cleanup;
      if (retired && !retired.ok) {
        remember(retired.error);
        try {
          this.client.invalidate(
            new AggregateError(errors, "Inspection retirement is uncertain"),
          );
        } catch (error) {
          remember(error);
        }
      }
      signal.removeEventListener("abort", cancelled);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "File inspection and retirement failed",
        { cause: errors[0] },
      );
    if (!facts) throw new Error("File inspection did not complete");
    return facts;
  }
  public close(): Promise<void> {
    this.closed = true;
    this.closing ??= this.finishClose();
    return this.closing;
  }
  private async finishClose(): Promise<void> {
    const pending = [...this.operations.values()];
    for (const abort of this.operations.keys())
      abort.abort(new Error("File runtime closed"));
    const results = await Promise.allSettled(pending);
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    try {
      await this.actors.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.closeControl?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, "File runtime cleanup failed", {
        cause: errors[0],
      });
  }
}
