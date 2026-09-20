import { readFile } from "node:fs/promises";
import { prepareAsset } from "@brains/assets";
import { prepareImageAsset } from "@brains/image";
import type { EntityServiceClient } from "@brains/plugins";
type Files = NonNullable<EntityServiceClient["fileAssets"]>;
/** Unit substitute for payload actors and native publication. */
export function mockImageFileAssets(service: EntityServiceClient): Files {
  return {
    inspect: async ({ sourceFile }): ReturnType<Files["inspect"]> => {
      const { facts } = prepareImageAsset(await readFile(sourceFile));
      return {
        sizeBytes: facts.sizeBytes,
        sha256: facts.digest,
        details: {
          format: facts.format,
          mediaType: facts.mediaType,
          width: facts.width,
          height: facts.height,
        },
      };
    },
    publish: async ({
      sourceFile,
      publication,
    }): ReturnType<Files["publish"]> => {
      const preparedAsset = prepareAsset(await readFile(sourceFile));
      if (preparedAsset.ref !== publication.request.entity.content)
        throw new Error("File publication digest mismatch");
      if (publication.operation === "createEntity")
        return service.createEntity({ ...publication.request, preparedAsset });
      if (publication.operation === "updateEntity")
        return service.updateEntity({ ...publication.request, preparedAsset });
      throw new Error("Unexpected file upsert");
    },
    fingerprint: async (): Promise<never> => {
      throw new Error("Unexpected fingerprint");
    },
    postHttp: async (): Promise<never> => {
      throw new Error("Unexpected HTTP POST upload");
    },
    putHttp: async (): Promise<never> => {
      throw new Error("Unexpected HTTP upload");
    },
    withAssetFile: async (): Promise<never> => {
      throw new Error("Unexpected asset file loan");
    },
    download: async (): Promise<never> => {
      throw new Error("Unexpected download");
    },
    close: async (): Promise<void> => undefined,
  };
}
