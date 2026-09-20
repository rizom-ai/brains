import type {
  EntityFileAssets,
  EntityBinaryRequestOptions,
} from "@brains/entity-service";
import { readBoundedJsonFile } from "@brains/utils/bounded-json-file";
import {
  responsiveImageRequestSchema,
  responsiveImageManifestSchema,
  RESPONSIVE_IMAGE_MANIFEST_BYTES,
  type ResponsiveImageRequest,
  type ResponsiveImageManifest,
} from "./responsive-image-contract";

/** Produce source-digest/width-named derivatives inside the caller's managed output directory.
 * The native actor verifies the source and existing cache bytes; the controller
 * reads only a bounded manifest while its loan remains alive. Paths are not authority.
 */
export async function optimizeImageFile(
  files: Pick<EntityFileAssets, "withProducedFile">,
  input: ResponsiveImageRequest,
  outputDirectory: string,
  options?: EntityBinaryRequestOptions,
): Promise<ResponsiveImageManifest> {
  const request = responsiveImageRequestSchema.parse(input);
  options?.signal?.throwIfAborted();
  if (!files.withProducedFile)
    throw new Error("Responsive image file production is not provisioned");
  return files.withProducedFile(
    outputDirectory,
    async (file, signal) => {
      if (file.sizeBytes > RESPONSIVE_IMAGE_MANIFEST_BYTES)
        throw new Error("Responsive image manifest exceeds its byte limit");
      const manifest = responsiveImageManifestSchema.parse(
        await readBoundedJsonFile(file.sourceFile, {
          maxBytes: RESPONSIVE_IMAGE_MANIFEST_BYTES,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          signal,
        }),
      );
      if (
        manifest.source.sha256 !== request.sha256 ||
        manifest.source.sizeBytes !== request.sizeBytes
      )
        throw new Error(
          "Responsive image manifest does not match its source receipt",
        );
      return manifest;
    },
    {
      producer: "responsive-image",
      metadata: {
        sourceFile: request.sourceFile,
        sizeBytes: String(request.sizeBytes),
        sha256: request.sha256,
      },
      ...(options?.signal && { signal: options.signal }),
    },
  );
}
