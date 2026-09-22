import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { UploadInspection } from "@brains/plugins/message-interface/upload-inspection";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAsset } from "@brains/assets";
import {
  EntityBinaryClient,
  EntityFileRuntime,
  type EntityServiceClient,
} from "@brains/entity-service";

/** Real native HTTP sender; a fixture-owned file stands in for a downloaded
 * asset loan; inspection is an explicit unit substitute. Database download
 * verification and the native inspector are covered separately. */
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
      captureUrl: new URL(
        "../../../shared/db/src/turso-worker/file-capture-process.ts",
        import.meta.url,
      ),
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
    withCapturedFile: (input, use, options): ReturnType<typeof use> =>
      runtime.withCapturedFile(input, use, options),
    putHttp: (input, options): ReturnType<EntityFileRuntime["putHttp"]> =>
      runtime.putHttp(input, options),
    inspect: async (
      source,
      options,
    ): ReturnType<EntityFileRuntime["inspect"]> => {
      if (options?.inspector !== "message-upload") unexpected();
      const bytes = await readFile(source.sourceFile);
      if (source.sizeBytes !== bytes.length)
        throw new Error("Fixture source size mismatch");
      const inspection = new UploadInspection(bytes.length);
      for (let offset = 0; offset < bytes.length; offset += 32768)
        inspection.observe(bytes.subarray(offset, offset + 32768));
      const facts = prepareAsset(bytes);
      const details = inspection.finish();
      return {
        sizeBytes: facts.sizeBytes,
        sha256: facts.digest,
        details: {
          validText: details.validText,
          ...(details.binaryMediaType && {
            binaryMediaType: details.binaryMediaType,
          }),
        },
      };
    },
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
