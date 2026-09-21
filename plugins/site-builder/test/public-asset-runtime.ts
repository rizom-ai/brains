import { EntityBinaryClient, EntityFileRuntime } from "@brains/entity-service";
import {
  fingerprintSiteFile,
  type SiteArtifactFingerprint,
} from "@brains/site-engine";

export const fingerprintArtifactFixture: SiteArtifactFingerprint = async (
  source,
) => {
  const runtime = createPublicAssetRuntime();
  try {
    return await fingerprintSiteFile(runtime, source);
  } finally {
    await runtime.close();
  }
};

/** Explicit source-artifact provisioning, not installed/default application wiring. */
export function createPublicAssetRuntime(): EntityFileRuntime {
  const unexpected = async (): Promise<never> => {
    throw new Error(
      "Unexpected database operation during public file processing",
    );
  };
  const actor = new URL(
    import.meta.resolve("@brains/site-engine/public-asset-process"),
  );
  return new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: unexpected,
        publication: unexpected,
        invalidate: (): never => {
          throw new Error("Unexpected database fence");
        },
      },
    }),
    {
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      inspectionUploadUrl: actor,
      producerUrls: { "site-public-assets": actor },
    },
  );
}
