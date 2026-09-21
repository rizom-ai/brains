import { dirname } from "node:path";
import type {
  EntityFileAssets,
  EntityFileSource,
  EntityBinaryRequestOptions,
} from "@brains/entity-service";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { z } from "@brains/utils/zod";
import { readBoundedJsonFile } from "@brains/utils/bounded-json-file";
import {
  publicAssetRequestSchema,
  type PublicAssetFacts,
} from "./public-asset-contract";

export type SiteArtifactFingerprint = (
  source: EntityFileSource,
) => Promise<PublicAssetFacts>;
const receiptSchema = z.strictObject({
  sizeBytes: z.number().int().nonnegative().max(MAX_ASSET_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
/** Final artifact verification also runs off-controller, including artifacts
 * written by staging subscribers rather than the public snapshot copier.
 */
export async function fingerprintSiteFile(
  files: Pick<EntityFileAssets, "withProducedFile"> | undefined,
  source: EntityFileSource,
  options?: EntityBinaryRequestOptions,
): Promise<PublicAssetFacts> {
  const request = publicAssetRequestSchema.parse({
    mode: "fingerprint",
    ...source,
  });
  if (request.mode !== "fingerprint")
    throw new Error("Invalid site fingerprint request");
  options?.signal?.throwIfAborted();
  if (!files?.withProducedFile)
    throw new Error("Site artifact fingerprinting is not provisioned");
  return files.withProducedFile(
    dirname(request.sourceFile),
    async (file, signal) => {
      const result = receiptSchema.parse(
        await readBoundedJsonFile(file.sourceFile, {
          maxBytes: 1024,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          signal,
        }),
      );
      if (result.sizeBytes !== request.sizeBytes)
        throw new Error("Site artifact fingerprint size mismatch");
      return result;
    },
    {
      producer: "site-public-assets",
      metadata: {
        mode: "fingerprint",
        sourceFile: request.sourceFile,
        sizeBytes: String(request.sizeBytes),
      },
      ...(options?.signal && { signal: options.signal }),
    },
  );
}
