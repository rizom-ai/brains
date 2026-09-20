import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";

export interface BoundedJsonFileOptions {
  maxBytes: number;
  sha256?: string;
  sizeBytes?: number;
  signal?: AbortSignal;
}
/** Metadata only: at most 64 KiB, actual reads bounded independently of stat.
 * No-follow regular-file open, strict UTF-8/JSON, optional receipt verification,
 * and joined descriptor close. A path is not an immutable snapshot.
 */
export async function readBoundedJsonFile(
  path: string,
  options: BoundedJsonFileOptions,
): Promise<unknown> {
  const { maxBytes, sha256, sizeBytes, signal } = options;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 65536)
    throw new Error("Invalid metadata file byte limit");
  if (sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("Invalid metadata file digest");
  if (
    sizeBytes !== undefined &&
    (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > maxBytes)
  )
    throw new Error("Invalid metadata file receipt size");
  signal?.throwIfAborted();
  if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK)
    throw new Error(
      "Metadata files require no-follow nonblocking open support",
    );
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const errors: unknown[] = [];
  let result: { value: unknown } | undefined;
  try {
    const before = await file.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size > BigInt(maxBytes) ||
      (sizeBytes !== undefined && before.size !== BigInt(sizeBytes))
    )
      throw new Error("Metadata file exceeds its bounds or is not regular");
    const bytes = new Uint8Array(maxBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      signal?.throwIfAborted();
      const read = await file.read(bytes, count, bytes.length - count, count);
      if (read.bytesRead === 0) break;
      count += read.bytesRead;
    }
    if (count > maxBytes)
      throw new Error("Metadata file exceeds its byte limit");
    const after = await file.stat({ bigint: true });
    if (
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      BigInt(count) !== after.size
    )
      throw new Error("Metadata file changed during reading");
    const content = bytes.subarray(0, count);
    if (
      sha256 !== undefined &&
      createHash("sha256").update(content).digest("hex") !== sha256
    )
      throw new Error("Metadata file digest mismatch");
    signal?.throwIfAborted();
    result = {
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(content),
      ),
    };
  } catch (error) {
    errors.push(error);
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
      "Metadata reading and descriptor retirement failed",
      { cause: errors[0] },
    );
  if (!result) throw new Error("Metadata read has no result");
  return result.value;
}
