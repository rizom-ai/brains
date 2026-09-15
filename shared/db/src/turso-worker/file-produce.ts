import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { withFileTarget } from "./file-target";
import { STAGE_BUDGET_BYTES, STAGE_CHUNK_BYTES } from "./binary-protocol";
import type { BlobFacts } from "./blob-protocol";

export interface FileProduceInput {
  sourceDirectory: string;
  outputFile: string;
}
export const fileProducePathSchema: z.ZodType<string> = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => isAbsolute(path) && !path.includes("\0"));
export const fileProduceSchema: z.ZodType<FileProduceInput> = z.strictObject({
  sourceDirectory: fileProducePathSchema,
  outputFile: fileProducePathSchema,
});
/** Actor-local SDK production. The creator admits the actor before acquisition.
 * The SDK backing stays here; only one borrowed 32 KiB write is outstanding.
 * The 100 MiB result ceiling is not a bound on SDK/native/browser peak memory.
 */
export async function produceFile(
  input: FileProduceInput,
  produce: (
    sourceDirectory: string,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>,
  signal?: AbortSignal,
): Promise<BlobFacts> {
  const options = fileProduceSchema.parse(input);
  signal?.throwIfAborted();
  return withFileTarget(
    { path: options.outputFile, maxBytes: STAGE_BUDGET_BYTES },
    async (target): Promise<BlobFacts> => {
      signal?.throwIfAborted();
      const bytes = await produce(options.sourceDirectory, signal);
      signal?.throwIfAborted();
      if (bytes.byteLength > STAGE_BUDGET_BYTES)
        throw new Error("Produced file exceeds its size limit");
      const hash = createHash("sha256");
      for (
        let offset = 0;
        offset < bytes.byteLength;
        offset += STAGE_CHUNK_BYTES
      ) {
        const chunk = bytes.subarray(
          offset,
          Math.min(offset + STAGE_CHUNK_BYTES, bytes.byteLength),
        );
        hash.update(chunk);
        await target.write(chunk);
      }
      return { sizeBytes: bytes.byteLength, sha256: hash.digest("hex") };
    },
    signal,
  );
}
