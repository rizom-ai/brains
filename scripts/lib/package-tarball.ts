import type { PublishedPackageManifest } from "@brains/build-tools";

const PACKAGE_MANIFEST_PATH = "package/package.json";

/** Read an npm package manifest without extracting the tarball to disk. */
export async function readPackageManifestFromTarball(
  source: Blob | Uint8Array,
  packageLabel: string,
): Promise<PublishedPackageManifest> {
  let files: Map<string, File>;
  try {
    files = await new Bun.Archive(source).files();
  } catch (error) {
    throw new Error(`Could not read ${packageLabel} tarball archive`, {
      cause: error,
    });
  }

  const manifestFile = files.get(PACKAGE_MANIFEST_PATH);
  if (!manifestFile) {
    throw new Error(
      `${packageLabel} tarball does not contain ${PACKAGE_MANIFEST_PATH}`,
    );
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(await manifestFile.text());
  } catch (error) {
    throw new Error(
      `Could not parse ${PACKAGE_MANIFEST_PATH} from ${packageLabel} tarball`,
      { cause: error },
    );
  }

  if (!isPublishedPackageManifest(manifest)) {
    throw new Error(
      `${PACKAGE_MANIFEST_PATH} from ${packageLabel} tarball is not an object`,
    );
  }
  return manifest;
}

function isPublishedPackageManifest(
  value: unknown,
): value is PublishedPackageManifest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
