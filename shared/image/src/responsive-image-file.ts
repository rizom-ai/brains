import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { withFileSource } from "@brains/db/file-source";
import {
  fileProduceSchema,
  produceFile,
  type FileProduceInput,
} from "@brains/db/file-produce";
import { isErrnoException } from "@brains/utils/predicates";
import { inspectImageBytes } from "./lib/image-utils";
import {
  RESPONSIVE_IMAGE_WIDTHS,
  RESPONSIVE_IMAGE_MANIFEST_BYTES,
  responsiveImageRequestSchema,
  responsiveImageManifestSchema,
  type ResponsiveImageVariant,
} from "./responsive-image-contract";

const CREDIT_BYTES = 32 * 1024;
async function matchesExisting(
  path: string,
  sizeBytes: number,
  digest: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size !== sizeBytes)
      throw new Error("Responsive image cache collision");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return false;
    throw error;
  }
  await withFileSource({ path, sizeBytes }, async (source): Promise<void> => {
    const credit = new Uint8Array(Math.min(CREDIT_BYTES, sizeBytes));
    const hash = createHash("sha256");
    for (let offset = 0; offset < sizeBytes; offset += credit.length) {
      signal?.throwIfAborted();
      const chunk = credit.subarray(
        0,
        Math.min(credit.length, sizeBytes - offset),
      );
      await source.readInto(chunk);
      hash.update(chunk);
    }
    await source.complete();
    if (hash.digest("hex") !== digest)
      throw new Error("Responsive image cache digest mismatch");
  });
  return true;
}

/** Actor-local decode/resize/encode. Only the bounded manifest returns to the
 * controller. Existing cache files are verified against freshly encoded bytes,
 * not trusted because of their paths. SDK/native peak memory is not bounded by
 * the encoded-file ceiling. Source reads and all outputs remain in this actor.
 */
export async function produceResponsiveImages(
  input: FileProduceInput,
  signal?: AbortSignal,
): Promise<{ sizeBytes: number; sha256: string }> {
  const plan = fileProduceSchema.parse(input);
  const request = responsiveImageRequestSchema.parse(plan.metadata);
  signal?.throwIfAborted();
  return produceFile(
    plan,
    async (): Promise<Uint8Array> => {
      const bytes = await withFileSource(
        { path: request.sourceFile, sizeBytes: request.sizeBytes },
        async (source): Promise<Uint8Array> => {
          const content = new Uint8Array(request.sizeBytes);
          const hash = createHash("sha256");
          for (
            let offset = 0;
            offset < content.length;
            offset += CREDIT_BYTES
          ) {
            signal?.throwIfAborted();
            const chunk = content.subarray(
              offset,
              Math.min(content.length, offset + CREDIT_BYTES),
            );
            await source.readInto(chunk);
            hash.update(chunk);
          }
          await source.complete();
          if (hash.digest("hex") !== request.sha256)
            throw new Error("Responsive image source digest mismatch");
          return content;
        },
      );
      const source = inspectImageBytes(bytes);
      const variants: ResponsiveImageVariant[] = [];
      for (const width of RESPONSIVE_IMAGE_WIDTHS) {
        signal?.throwIfAborted();
        if (width > source.width) continue;
        const encoded = await new Bun.Image(bytes)
          .resize(width, undefined, { withoutEnlargement: true })
          .webp({ quality: 80 })
          .bytes();
        signal?.throwIfAborted();
        if (encoded.byteLength > MAX_ASSET_BYTES)
          throw new Error("Responsive image exceeds its size limit");
        const inspected = inspectImageBytes(encoded, "image/webp");
        const digest = createHash("sha256").update(encoded).digest("hex");
        const filename = `${request.sha256.slice(0, 16)}-${width}w.webp`;
        const path = join(plan.sourceDirectory, filename);
        if (
          !(await matchesExisting(path, encoded.byteLength, digest, signal))
        ) {
          try {
            await produceFile(
              { sourceDirectory: plan.sourceDirectory, outputFile: path },
              async () => encoded,
              signal,
            );
          } catch (error) {
            // A simultaneous identical publisher may win. Never overwrite it or
            // delete this failed attempt's staging. Other failures remain failures.
            if (!isErrnoException(error) || error.code !== "EEXIST")
              throw error;
            let matched: boolean;
            try {
              matched = await matchesExisting(
                path,
                encoded.byteLength,
                digest,
                signal,
              );
            } catch (verificationError) {
              throw new AggregateError(
                [error, verificationError],
                "Responsive image collision verification failed",
                { cause: verificationError },
              );
            }
            if (!matched) throw error;
          }
        }
        variants.push({
          filename,
          width: inspected.width,
          height: inspected.height,
          sizeBytes: encoded.byteLength,
          sha256: digest,
        });
      }
      const manifest = responsiveImageManifestSchema.parse({
        source: {
          sha256: request.sha256,
          sizeBytes: request.sizeBytes,
          width: source.width,
          height: source.height,
          format: source.format,
        },
        variants,
      });
      const metadata = new TextEncoder().encode(JSON.stringify(manifest));
      if (metadata.length > RESPONSIVE_IMAGE_MANIFEST_BYTES)
        throw new Error("Responsive image manifest exceeds its byte limit");
      return metadata;
    },
    signal,
  );
}
