import { isAbsolute } from "node:path";
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
import type { EntityBinaryClient } from "./entity-binary-client";
import type { FileUploadInput } from "@brains/db/file-upload";
import type { EntityFilePublicationInput } from "./entity-file-publication";
import type { EntityFileDownloadInput } from "./entity-file-download";
import type { EntityMutationResult } from "./types";
/** Caller-trusted absolute file location, not a filesystem authorization token. */
export interface EntityFileSource {
  sourceFile: string;
  sizeBytes: number;
}
export interface EntityFileAssets {
  inspect(input: EntityFileSource): Promise<FileInspectionResult>;
  /** Actor-local file hashing with native verification and acknowledged transient retirement. */
  fingerprint(
    input: EntityFileSource,
  ): Promise<{ sizeBytes: number; sha256: string }>;
  publish(input: EntityFilePublicationInput): Promise<EntityMutationResult>;
  download(
    input: EntityFileDownloadInput,
  ): Promise<{ sizeBytes: number; sha256: string }>;
  close(): Promise<void>;
}
export type EntityFileActorOptions = FileProcessOwnerOptions & {
  inspectionUploadUrl: URL;
};
const sourceSchema: z.ZodType<EntityFileSource> = z.strictObject({
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
  private run<T>(body: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error("File runtime is closing"));
    if (this.operations.size >= 16)
      return Promise.reject(
        new Error("File operation admission capacity exceeded"),
      );
    const abort = new AbortController();
    const work = Promise.resolve()
      .then(() => body(abort.signal))
      .finally(() => {
        this.operations.delete(abort);
      });
    this.operations.set(abort, work);
    return work;
  }
  public publish(
    input: EntityFilePublicationInput,
  ): Promise<EntityMutationResult> {
    return this.run((signal) =>
      this.client.publishFile(input, this.actors, { signal }),
    );
  }
  public download(
    input: EntityFileDownloadInput,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    return this.run((signal) =>
      this.client.downloadFile(input, this.actors, { signal }),
    );
  }
  public inspect(input: EntityFileSource): Promise<FileInspectionResult> {
    return this.run((signal) =>
      this.inspectOwned(input, signal, (source, abort) =>
        this.actors.inspectUpload(source, abort),
      ),
    );
  }
  public fingerprint(
    input: EntityFileSource,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    return this.run((signal) =>
      this.inspectOwned(input, signal, (source, abort) =>
        this.actors.upload(source, abort),
      ),
    );
  }
  private async inspectOwned<T extends { sizeBytes: number; sha256: string }>(
    input: EntityFileSource,
    signal: AbortSignal,
    upload: (source: FileUploadInput, abort: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const parsed = sourceSchema.parse(input);
    signal.throwIfAborted();
    const offered = await observe(() => this.client.offer(parsed.sizeBytes));
    if (!offered.ok) {
      this.client.invalidate(offered.error);
      throw offered.error;
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
