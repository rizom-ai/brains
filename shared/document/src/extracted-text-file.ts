import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";

/** Reads logical extracted text, not a PDF or a metadata manifest. Every read is
 * bounded; the native receipt, strict UTF-8 and file stability are verified before
 * exposing text. Does not change the separate 64 KiB metadata-file allowance. */
export async function readExtractedTextFile(
  path: string,
  options: {
    maxBytes: number;
    sizeBytes: number;
    sha256: string;
    signal: AbortSignal;
  },
): Promise<string> {
  const { maxBytes, sizeBytes, sha256, signal } = options;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 16 * 1024 * 1024 ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    sizeBytes > maxBytes ||
    !/^[a-f0-9]{64}$/.test(sha256)
  )
    throw new Error("Invalid extracted text receipt");
  signal.throwIfAborted();
  if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK)
    throw new Error(
      "Extracted text requires no-follow nonblocking open support",
    );
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const errors: unknown[] = [];
  let result: string | undefined;
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(sizeBytes))
      throw new Error("Extracted text size mismatch");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const hash = createHash("sha256");
    const credit = new Uint8Array(32768);
    const text: string[] = [];
    let count = 0;
    for (;;) {
      signal.throwIfAborted();
      const read = await file.read(
        credit,
        0,
        Math.min(credit.length, sizeBytes - count + 1),
        count,
      );
      if (read.bytesRead === 0) break;
      count += read.bytesRead;
      if (count > sizeBytes)
        throw new Error("Extracted text exceeds its receipt");
      const view = credit.subarray(0, read.bytesRead);
      hash.update(view);
      text.push(decoder.decode(view, { stream: true }));
    }
    text.push(decoder.decode());
    const after = await file.stat({ bigint: true });
    if (
      count !== sizeBytes ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      hash.digest("hex") !== sha256
    )
      throw new Error("Extracted text changed or failed digest verification");
    signal.throwIfAborted();
    result = text.join("");
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
      "Extracted text reading and retirement failed",
      { cause: errors[0] },
    );
  if (result === undefined) throw new Error("Extracted text has no result");
  return result;
}
