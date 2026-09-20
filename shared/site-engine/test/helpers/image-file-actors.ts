import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectImageBytes } from "@brains/image";
import { createHash } from "node:crypto";
import {
  EntityBinaryClient,
  EntityFileRuntime,
  type EntityFileAssets,
  type EntityBinaryRequestOptions,
  type EntityVerifiedFileSource,
} from "@brains/entity-service";
import type { AssetRef } from "@brains/assets";

/** Real responsive-image producer. Database download/inspection collaborators
 * are fixture substitutes; their native paths have separate canonical coverage.
 */
export function createImageFileActors(
  asset?: (ref: AssetRef) => Uint8Array | undefined,
): EntityFileAssets {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected fixture operation");
  };
  const actor = new URL(
    import.meta.resolve("@brains/image/responsive-image-process"),
  );
  const runtime = new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: unexpected,
        publication: unexpected,
        invalidate: (): never => {
          throw new Error("Unexpected fence");
        },
      },
    }),
    {
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      inspectionUploadUrl: actor,
      producerUrls: { "responsive-image": actor },
    },
  );
  return {
    withProducedFile: runtime.withProducedFile.bind(runtime),
    close: runtime.close.bind(runtime),
    fingerprint: async ({
      sourceFile,
      sizeBytes,
    }): Promise<{ sizeBytes: number; sha256: string }> => {
      const bytes = await readFile(sourceFile);
      if (bytes.length !== sizeBytes) throw new Error("Fixture size mismatch");
      return {
        sizeBytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    },
    download: async ({
      ref,
      outputFile,
    }): Promise<{ sizeBytes: number; sha256: string }> => {
      const bytes = asset?.(ref);
      if (!bytes) throw new Error("Missing fixture asset");
      await writeFile(outputFile, bytes, { flag: "wx" });
      return {
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    },
    async withAssetFile<T>(
      ref: AssetRef,
      use: (file: EntityVerifiedFileSource, signal: AbortSignal) => Promise<T>,
      options?: EntityBinaryRequestOptions,
    ): Promise<T> {
      const bytes = asset?.(ref);
      if (!bytes) throw new Error("Missing fixture asset");
      const directory = await mkdtemp(join(tmpdir(), "site-image-loan-"));
      try {
        return await use(
          await imageSource(join(directory, "source"), bytes),
          options?.signal ?? new AbortController().signal,
        );
      } finally {
        await rm(directory, { recursive: true });
      }
    },
    putHttp: unexpected,
    postHttp: unexpected,
    inspect: async ({
      sourceFile,
      sizeBytes,
    }): ReturnType<EntityFileAssets["inspect"]> => {
      const bytes = await readFile(sourceFile);
      if (bytes.length !== sizeBytes) throw new Error("Fixture size mismatch");
      const { format, mediaType, width, height } = inspectImageBytes(bytes);
      return {
        sizeBytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        details: { format, mediaType, width, height },
      };
    },
    publish: unexpected,
  };
}
export async function imageSource(
  path: string,
  bytes: Uint8Array,
): Promise<EntityVerifiedFileSource> {
  await writeFile(path, bytes);
  return {
    sourceFile: path,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
