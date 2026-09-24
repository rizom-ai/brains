import { readFile, stat } from "node:fs/promises";
import { prepareImageAsset } from "@brains/image";
import type { EntityFileAssets, IEntityService } from "@brains/entity-service";

/** Recipe boot tests substitute transport only. Fixture bytes are not a
 * production fallback or evidence of installed native actor provisioning. */
export function installEvalImageFiles(
  service: Pick<IEntityService, "fileAssets" | "upsertEntity">,
): void {
  const read = async (
    sourceFile: string,
  ): Promise<ReturnType<typeof prepareImageAsset>> => {
    if (!sourceFile.endsWith(".png") || (await stat(sourceFile)).size > 1024)
      throw new Error("Unexpected eval image fixture");
    return prepareImageAsset(await readFile(sourceFile), "image/png");
  };
  const unsupported = async (): Promise<never> => {
    throw new Error("Recipe fixture requested an unsupported file operation");
  };
  const files: EntityFileAssets = {
    inspect: async ({ sourceFile }, options) => {
      options?.signal?.throwIfAborted();
      const { facts } = await read(sourceFile);
      options?.signal?.throwIfAborted();
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
    publish: async (input, options) => {
      options?.signal?.throwIfAborted();
      const { asset } = await read(input.sourceFile);
      options?.signal?.throwIfAborted();
      if (
        input.publication.operation !== "upsertEntity" ||
        input.publication.request.entity.content !== asset.ref ||
        input.sizeBytes !== asset.sizeBytes
      )
        throw new Error("Unexpected eval image publication");
      return service.upsertEntity({
        ...input.publication.request,
        preparedAsset: asset,
      });
    },
    withAssetFile: unsupported,
    putHttp: unsupported,
    postHttp: unsupported,
    fingerprint: unsupported,
    download: unsupported,
    close: async (): Promise<void> => {},
  };
  service.fileAssets = files;
}
