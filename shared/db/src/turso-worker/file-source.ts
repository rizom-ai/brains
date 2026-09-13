import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";

export const fileSourceSchema: z.ZodType<{ path: string; sizeBytes: number }> =
  z.strictObject({
    path: z
      .string()
      .min(1)
      .max(4096)
      .refine(isAbsolute, "File source requires an absolute path"),
    sizeBytes: z.number().int().nonnegative(),
  });

export interface FileChunkSource {
  /** Fill only the caller's already-admitted credit buffer; no whole-file allocation. */
  readInto(target: Uint8Array): Promise<void>;
  /** Required before sending a terminal frame. This is not a filesystem snapshot. */
  complete(): Promise<void>;
}

/** Data-actor I/O only. The caller owns authorization, byte ceilings and credits. */
export async function withFileSource<T>(
  input: { path: string; sizeBytes: number },
  body: (source: FileChunkSource) => Promise<T>,
): Promise<T> {
  const plan = fileSourceSchema.parse(input);
  if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK) {
    throw new Error(
      "File source requires no-follow and nonblocking open support",
    );
  }
  // Nonblocking open prevents a FIFO from hanging before the regular-file check.
  const file = await open(
    plan.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const errors: unknown[] = [];
  let result: { value: T } | undefined;
  let active = true;
  const state: { complete: boolean } = { complete: false };
  let position = 0;
  let pending: Promise<void> | undefined;
  const run = (operation: () => Promise<void>): Promise<void> => {
    if (!active || state.complete)
      return Promise.reject(new Error("File source is closed or complete"));
    if (pending)
      return Promise.reject(new Error("Concurrent file source operation"));
    const task = operation();
    const observed = task
      .catch((error: unknown) => {
        active = false;
        errors.push(error);
        throw error;
      })
      .finally(() => {
        pending = undefined;
      });
    pending = observed;
    // Body failure must still drain an unawaited native read before closing its FD.
    void observed.catch(() => undefined);
    return observed;
  };
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(plan.sizeBytes))
      throw new Error("File source is not a regular file of the declared size");
    result = {
      value: await body({
        readInto: (target) =>
          run(async () => {
            if (
              target.byteLength === 0 ||
              target.byteLength > plan.sizeBytes - position
            )
              throw new Error("File read exceeds declared remaining bytes");
            let filled = 0;
            while (filled < target.byteLength) {
              const { bytesRead } = await file.read(
                target,
                filled,
                target.byteLength - filled,
                position + filled,
              );
              if (bytesRead === 0)
                throw new Error("File source ended before its declared size");
              filled += bytesRead;
            }
            position += filled;
          }),
        complete: () =>
          run(async () => {
            if (position !== plan.sizeBytes)
              throw new Error("File source was not completely consumed");
            const after = await file.stat({ bigint: true });
            if (
              after.size !== before.size ||
              after.mtimeNs !== before.mtimeNs ||
              after.ctimeNs !== before.ctimeNs
            )
              throw new Error("File source changed during transfer");
            state.complete = true;
          }),
      }),
    };
    if (!state.complete)
      throw new Error("File source completion was not acknowledged");
  } catch (error) {
    if (!errors.includes(error)) errors.push(error);
  }
  active = false;
  try {
    await pending;
  } catch (error) {
    if (!errors.includes(error)) errors.push(error);
  }
  try {
    await file.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "File source operation and cleanup failed",
      { cause: errors[0] },
    );
  if (!result) throw new Error("Missing completed file source result");
  return result.value;
}
