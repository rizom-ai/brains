import { readFile, writeFile } from "node:fs/promises";
import {
  prepareAsset,
  type AssetRef,
  type PreparedAsset,
} from "@brains/assets";
import { extname } from "node:path";
import { getMimeTypeForExtension } from "../../src/lib/image-file-utils";
import { prepareImageAsset, parseDataUrl } from "@brains/image";
import type { EntityServiceClient } from "@brains/plugins";
type Files = NonNullable<EntityServiceClient["fileAssets"]>;
/** Unit-only URL actor/native substitute. Fixtures may use data URLs; callers receive only file metadata. */
export function installRemoteFileAssets(
  service: EntityServiceClient,
  fixture: (url: string) => Promise<string>,
): void {
  const assets = new Map<string, PreparedAsset>();
  let sequence = 0;
  const files = mockFileAssets(
    async ({ sourceFile, publication }): ReturnType<Files["publish"]> => {
      const preparedAsset = assets.get(sourceFile);
      if (!preparedAsset || publication.operation !== "createEntity")
        throw new Error("Unexpected fixture publication");
      return service.createEntity({ ...publication.request, preparedAsset });
    },
  );
  files.withRemoteFile = async (url, use, options): ReturnType<typeof use> => {
    const signal = options?.signal ?? new AbortController().signal;
    signal.throwIfAborted();
    const parsed = parseDataUrl(await fixture(url));
    signal.throwIfAborted();
    const { asset, facts } = prepareImageAsset(parsed.bytes, parsed.mediaType);
    const sourceFile = `/fixture/remote-${sequence++}`;
    assets.set(sourceFile, asset);
    try {
      return await use(
        {
          sourceFile,
          sizeBytes: facts.sizeBytes,
          sha256: facts.digest,
          details: {
            format: facts.format,
            mediaType: facts.mediaType,
            width: facts.width,
            height: facts.height,
          },
        },
        signal,
      );
    } finally {
      assets.delete(sourceFile);
    }
  };
  service.fileAssets = files;
}
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
