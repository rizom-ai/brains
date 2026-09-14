import { readFile, writeFile } from "node:fs/promises";
import { prepareAsset, type AssetRef } from "@brains/assets";
import { extname } from "node:path";
import { getMimeTypeForExtension } from "../../src/lib/image-file-utils";
import { prepareImageAsset } from "@brains/image";
import type { EntityServiceClient } from "@brains/plugins";
type Files = NonNullable<EntityServiceClient["fileAssets"]>;
/** Unit-test substitute for the external payload actor. Production never imports this. */
export function mockFileAssets(
  publish?: Files["publish"],
  read?: (ref: AssetRef) => Promise<Uint8Array>,
): Files {
  return {
    inspect: async ({ sourceFile }): ReturnType<Files["inspect"]> => {
      const { facts } = prepareImageAsset(
        await readFile(sourceFile),
        getMimeTypeForExtension(extname(sourceFile)),
      );
      return {
        sizeBytes: facts.sizeBytes,
        sha256: facts.digest,
        details: {
          format: facts.format,
          mediaType: facts.mediaType,
          width: facts.width,
          height: facts.height,
          sizeBytes: facts.sizeBytes,
        },
      };
    },
    publish:
      publish ??
      (async (): Promise<never> => {
        throw new Error("File publication not configured");
      }),
    fingerprint: async ({ sourceFile }): ReturnType<Files["fingerprint"]> => {
      const asset = prepareAsset(await readFile(sourceFile));
      return { sizeBytes: asset.sizeBytes, sha256: asset.digest };
    },
    download: async ({ ref, outputFile }): ReturnType<Files["download"]> => {
      if (!read) throw new Error("asset read not configured");
      const asset = prepareAsset(await read(ref));
      if (asset.ref !== ref) throw new Error("Asset digest mismatch");
      await writeFile(outputFile, asset.bytes, { flag: "wx" });
      return { sizeBytes: asset.sizeBytes, sha256: asset.digest };
    },
    close: async (): Promise<void> => undefined,
  };
}
