import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { getMimeTypeForExtension } from "../../src/lib/image-file-utils";
import { prepareImageAsset } from "@brains/image";
import type { EntityServiceClient } from "@brains/plugins";
type Files = NonNullable<EntityServiceClient["fileAssets"]>;
/** Unit-test substitute for the external payload actor. Production never imports this. */
export function mockFileAssets(publish?: Files["publish"]): Files {
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
    download: async (): Promise<never> => {
      throw new Error("File download not configured");
    },
    close: async (): Promise<void> => undefined,
  };
}
