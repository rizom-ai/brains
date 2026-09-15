import { constants } from "node:fs";
import { open, link, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "@brains/utils/zod";
import { STAGE_BUDGET_BYTES, STAGE_CHUNK_BYTES } from "./binary-protocol";

const pathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => isAbsolute(path) && !path.includes("\0"));
const sizeSchema = z.number().int().min(0).max(STAGE_BUDGET_BYTES);
const planSchema = z.union([
  z.strictObject({ path: pathSchema, sizeBytes: sizeSchema }),
  z.strictObject({ path: pathSchema, maxBytes: sizeSchema }),
]);
export type FileTargetPlan = { path: string } & (
  { sizeBytes: number } | { maxBytes: number }
);
export interface FileChunkTarget {
  /** Borrows the view through settlement; the caller must not mutate or reuse it meanwhile. */
  write(bytes: Uint8Array): Promise<void>;
}

/** Payload-actor sink in a caller-trusted directory, not path authorization.
 * Publishes without replacement only after body success, complete writes, fsync
 * and file close. Failed/interrupted staging is retained. Publication is not
 * retracted if acknowledgement or later directory cleanup fails.
 */
export async function withFileTarget<T>(
  input: FileTargetPlan,
  body: (target: FileChunkTarget) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const plan = planSchema.parse(input);
  const limit = "sizeBytes" in plan ? plan.sizeBytes : plan.maxBytes;
  signal?.throwIfAborted();
  if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK || !constants.O_DIRECTORY)
    throw new Error(
      "File target requires no-follow, nonblocking and directory-open support",
    );
  const directoryPath = dirname(plan.path);
  const staging = join(directoryPath, `.turso-${randomUUID()}.partial`);
  const directory = await open(
    directoryPath,
    constants.O_RDONLY |
      constants.O_DIRECTORY |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
  );
  const errors: unknown[] = [];
  const failed = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  let file: FileHandle | undefined;
  let pending: Promise<void> | undefined;
  let active = true;
  let position = 0;
  let result: { value: T } | undefined;
  try {
    signal?.throwIfAborted();
    file = await open(
      staging,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
      0o600,
    );
    const output = file;
    signal?.throwIfAborted();
    result = {
      value: await body({
        write: (bytes): Promise<void> => {
          if (!active)
            return Promise.reject(new Error("File target is closed"));
          if (pending)
            return Promise.reject(new Error("Concurrent file target write"));
          if (bytes.byteLength > STAGE_CHUNK_BYTES)
            return Promise.reject(
              new Error("File target write exceeds credit"),
            );
          if (bytes.byteLength > limit - position)
            return Promise.reject(
              new Error("File target exceeds its declared size"),
            );
          const operation = (async (): Promise<void> => {
            signal?.throwIfAborted();
            let written = 0;
            while (written < bytes.byteLength) {
              const next = await output.write(
                bytes,
                written,
                bytes.byteLength - written,
                position + written,
              );
              if (next.bytesWritten <= 0)
                throw new Error("File target write made no progress");
              written += next.bytesWritten;
            }
            position += written;
          })();
          pending = operation;
          return operation
            .catch((error: unknown) => {
              failed(error);
              throw error;
            })
            .finally(() => {
              pending = undefined;
            });
        },
      }),
    };
  } catch (error) {
    failed(error);
  }
  active = false;
  try {
    await pending;
  } catch (error) {
    failed(error);
  }
  if (errors.length === 0 && "sizeBytes" in plan && position !== plan.sizeBytes)
    failed(new Error("File target was not completely written"));
  if (file) {
    if (errors.length === 0) {
      try {
        await file.sync();
      } catch (error) {
        failed(error);
      }
    }
    try {
      await file.close();
    } catch (error) {
      failed(error);
    }
  }
  if (errors.length === 0) {
    try {
      signal?.throwIfAborted();
      await link(staging, plan.path); // Atomic no-replace publication, including existing symlinks.
      await directory.sync();
      await unlink(staging);
      await directory.sync();
    } catch (error) {
      failed(error);
    }
  }
  try {
    await directory.close();
  } catch (error) {
    failed(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "File target operation and cleanup failed",
      { cause: errors[0] },
    );
  if (!result) throw new Error("File target completion was not acknowledged");
  return result.value;
}
