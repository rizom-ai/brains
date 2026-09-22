import { MAX_ASSET_BYTES } from "@brains/assets";
import { z } from "@brains/utils/zod";
import type {
  EntityFileAssets,
  EntityCapturedFileSource,
  EntityFileCaptureInput,
  EntityBinaryRequestOptions,
} from "@brains/entity-service";
import {
  AcknowledgedRuntimeUploadError,
  type RuntimeUploadRecord,
  runtimeUploadFileDescriptionSchema,
  type RuntimeUploadFileDescription,
  type ScopedRuntimeUploadStore,
} from "./upload-registry";

export interface CaptureRuntimeUploadSource extends EntityFileCaptureInput {
  maxBytes: number;
}
export interface CaptureRuntimeUploadInput extends RuntimeUploadFileDescription {
  source: CaptureRuntimeUploadSource;
}
export interface CaptureRuntimeUploadOptions extends EntityBinaryRequestOptions {
  /** Runs inside the guarded loan, before retention, with the borrowed signal. */
  validateFile?: (
    file: EntityCapturedFileSource,
    signal: AbortSignal,
  ) => Promise<void>;
}
const captureLimitSchema = z.number().int().positive().max(MAX_ASSET_BYTES);

/** Retain an owned download inside its loan, without reading payload bytes.
 * MIME declarations are hints; subsequent promotion still inspects the file.
 * A saved upload remains acknowledged even if its capture scope fails to retire.
 */
export async function captureRuntimeUpload(
  input: CaptureRuntimeUploadInput,
  files: Pick<EntityFileAssets, "withCapturedFile">,
  store: Pick<ScopedRuntimeUploadStore, "saveFile">,
  options?: CaptureRuntimeUploadOptions,
): Promise<RuntimeUploadRecord> {
  options?.signal?.throwIfAborted();
  if (!files.withCapturedFile)
    throw new Error("File capture is not provisioned");
  const source = {
    ...input.source,
    maxBytes: captureLimitSchema.parse(input.source.maxBytes),
  };
  const description = runtimeUploadFileDescriptionSchema.parse({
    filename: input.filename,
    mediaType: input.mediaType,
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  });
  if (Buffer.byteLength(JSON.stringify(description), "utf8") > 16_384)
    throw new Error("Upload metadata exceeds its byte limit");
  const errors: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  let open = true;
  let entered = false;
  let saved: RuntimeUploadRecord | undefined;
  let pending: Promise<RuntimeUploadRecord> | undefined;
  let returned: RuntimeUploadRecord | undefined;
  try {
    returned = await files.withCapturedFile(
      source,
      (file, signal) => {
        if (!open || entered)
          return Promise.reject(
            new Error("Upload capture consumer is closed or already entered"),
          );
        entered = true;
        pending = (async (): Promise<RuntimeUploadRecord> => {
          signal.throwIfAborted();
          try {
            await options?.validateFile?.(file, signal);
            signal.throwIfAborted();
            saved = await store.saveFile({
              ...description,
              sourceFile: file.sourceFile,
              sizeBytes: file.sizeBytes,
            });
            return saved;
          } catch (error) {
            if (error instanceof AcknowledgedRuntimeUploadError)
              saved = error.record;
            throw error;
          }
        })();
        void pending.catch(remember);
        return pending;
      },
      options?.signal ? { signal: options.signal } : undefined,
    );
  } catch (error) {
    remember(error);
  }
  open = false;
  if (pending) await pending.catch(remember);
  if (errors.length === 0 && (!saved || returned !== saved))
    remember(new Error("Upload capture did not return its consumer outcome"));
  if (errors.length) {
    const failure =
      errors.length === 1
        ? errors[0]
        : new AggregateError(
            errors,
            "Upload retention and capture retirement failed",
            { cause: errors[0] },
          );
    if (
      failure instanceof AcknowledgedRuntimeUploadError &&
      failure.record === saved
    )
      throw failure;
    if (saved) throw new AcknowledgedRuntimeUploadError(saved, failure);
    throw failure;
  }
  if (!saved) throw new Error("Upload capture has no saved record");
  return saved;
}
