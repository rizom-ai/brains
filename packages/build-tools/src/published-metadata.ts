export interface PublishedCompatibilityTarget {
  name: string;
  version: string;
  brainRange: string;
}

export interface PublishedPackageManifest {
  peerDependencies?: Record<string, string>;
  publishPeerDependencies?: Record<string, string>;
  publishExports?: unknown;
}

/** Verify the compatibility contract in either registry or tarball metadata. */
export function assertPublishedCompatibilityMetadata(
  target: PublishedCompatibilityTarget,
  manifest: PublishedPackageManifest,
  source: "registry packument" | "tarball manifest",
): void {
  const publishedRange = manifest.peerDependencies?.["@rizom/brain"];
  if (publishedRange !== target.brainRange) {
    throw new Error(
      `${target.name}@${target.version} ${source} has @rizom/brain peer range ${JSON.stringify(publishedRange)}; expected ${JSON.stringify(target.brainRange)}`,
    );
  }
  const authoringOnlyFields = [
    "publishPeerDependencies",
    "publishExports",
  ].filter(
    (field) => manifest[field as keyof PublishedPackageManifest] !== undefined,
  );
  if (authoringOnlyFields.length > 0) {
    throw new Error(
      `${target.name}@${target.version} ${source} retains authoring-only ${authoringOnlyFields.join(", ")}`,
    );
  }
}
