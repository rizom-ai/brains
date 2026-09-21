import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAsset } from "@brains/assets";
import {
  EntityBinaryClient,
  EntityFileRuntime,
  type EntityServiceClient,
} from "@brains/entity-service";

/** Real native HTTP sender; a fixture-owned file stands in for a downloaded
 * asset loan. Database download verification is covered by its own tests. */
export async function installAttachmentFileFixture(
  service: Pick<EntityServiceClient, "fileAssets">,
  bytes: Uint8Array,
): Promise<() => Promise<void>> {
  const directory = await mkdtemp(join(tmpdir(), "web-attachment-file-"));
  const sourceFile = join(directory, "artifact");
  await writeFile(sourceFile, bytes, { flag: "wx" });
  const asset = prepareAsset(bytes);
  const unexpected = (): never => {
    throw new Error("Unexpected fixture operation");
  };
  const actor = new URL(
    "../../../shared/db/src/turso-worker/file-http-upload-process.ts",
    import.meta.url,
  );
  const runtime = new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: unexpected,
        publication: unexpected,
        invalidate: unexpected,
      },
    }),
    {
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      inspectionUploadUrl: actor,
      httpUploadUrl: actor,
    },
  );
  service.fileAssets = {
    withAssetFile: async (ref, use, options): ReturnType<typeof use> => {
      if (ref !== asset.ref)
        throw new Error("Unexpected fixture asset reference");
      return use(
        { sourceFile, sizeBytes: asset.sizeBytes, sha256: asset.digest },
        options?.signal ?? new AbortController().signal,
      );
    },
    putHttp: (input, options): ReturnType<EntityFileRuntime["putHttp"]> =>
      runtime.putHttp(input, options),
    inspect: unexpected,
    publish: unexpected,
    fingerprint: unexpected,
    download: unexpected,
    postHttp: unexpected,
    close: (): Promise<void> => runtime.close(),
  };
  return async (): Promise<void> => {
    await runtime.close();
    await rm(directory, { recursive: true });
  };
}
