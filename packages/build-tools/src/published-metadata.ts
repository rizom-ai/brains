export interface PublishedCompatibilityTarget {
  name: string;
  version: string;
  brainRange: string;
}

export interface PublishedPackageManifest {
  // Identity travels with both shapes this models — a registry packument and a
  // tarball's package.json — so readers can assert on what they parsed.
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  publishPeerDependencies?: Record<string, string>;
  publishExports?: unknown;
}

/**
 * Fields the publish transform must strip. Declared as manifest keys so a
 * rename fails to compile rather than silently stopping the check.
 */
const AUTHORING_ONLY_FIELDS = [
  "publishPeerDependencies",
  "publishExports",
] as const satisfies readonly (keyof PublishedPackageManifest)[];

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
  const authoringOnlyFields = AUTHORING_ONLY_FIELDS.filter(
    (field) => manifest[field] !== undefined,
  );
  if (authoringOnlyFields.length > 0) {
    throw new Error(
      `${target.name}@${target.version} ${source} retains authoring-only ${authoringOnlyFields.join(", ")}`,
    );
  }

  // The publish transform must resolve every workspace: range to a concrete
  // version. A lingering workspace: specifier in a published manifest is
  // uninstallable — the exact failure mode behind the alpha.144/145 packument
  // incident — so reject it wherever it survives.
  const workspaceSpecifiers: string[] = [];
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const) {
    const deps = manifest[field];
    if (deps === undefined) {
      continue;
    }
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        workspaceSpecifiers.push(`${field}.${name} (${range})`);
      }
    }
  }
  if (workspaceSpecifiers.length > 0) {
    throw new Error(
      `${target.name}@${target.version} ${source} ships unresolved workspace: specifiers: ${workspaceSpecifiers.join(", ")}`,
    );
  }
}
