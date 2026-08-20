import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";

const packageManifestSchema = z.looseObject({
  name: z.string().min(1),
  version: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

export interface InstalledPackageManifest {
  readonly name: string;
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly directory: string;
}

export class PackagePeerCompatibilityError extends Error {
  constructor(
    packageMetadata: InstalledPackageManifest,
    brainVersion: string,
    peerRange: string | undefined,
  ) {
    super(
      peerRange
        ? `Package "${packageMetadata.name}@${packageMetadata.version}" requires @rizom/brain "${peerRange}", but "${brainVersion}" is installed; install a compatible Brain version or update the peer range only after testing that release`
        : `Package "${packageMetadata.name}@${packageMetadata.version}" must declare a @rizom/brain peer dependency; add the tested range under peerDependencies in its package.json`,
    );
    this.name = "PackagePeerCompatibilityError";
  }
}

function matchesPackageRef(packageRef: string, packageName: string): boolean {
  return packageRef === packageName || packageRef.startsWith(`${packageName}/`);
}

function ancestorDirectories(directory: string): string[] {
  const parent = dirname(directory);
  return parent === directory
    ? [directory]
    : [directory, ...ancestorDirectories(parent)];
}

export function resolveInstalledPackageManifest(
  packageRef: string,
  fromDirectory: string,
): InstalledPackageManifest {
  let resolved: string;
  try {
    resolved = Bun.resolveSync(packageRef, fromDirectory);
  } catch (error) {
    throw new Error(
      `Could not resolve installed package "${packageRef}" from "${fromDirectory}"; install it in the Brain application or correct the package reference`,
      { cause: error },
    );
  }

  for (const directory of ancestorDirectories(dirname(resolved))) {
    const manifestPath = join(directory, "package.json");
    if (!existsSync(manifestPath)) continue;

    const rawManifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const parsed = packageManifestSchema.safeParse(rawManifest);
    if (parsed.success && matchesPackageRef(packageRef, parsed.data.name)) {
      return Object.freeze({
        name: parsed.data.name,
        version: parsed.data.version,
        dependencies: Object.freeze({
          ...(parsed.data.dependencies ?? {}),
        }),
        peerDependencies: Object.freeze({
          ...(parsed.data.peerDependencies ?? {}),
        }),
        directory,
      });
    }
  }

  throw new Error(
    `Resolved package "${packageRef}" from "${fromDirectory}" but could not find valid package metadata; ensure its package.json declares matching non-empty name and version fields`,
  );
}

function assertBrainPeerCompatibility(
  packageMetadata: InstalledPackageManifest,
  brainVersion: string,
): void {
  const peerRange = packageMetadata.peerDependencies["@rizom/brain"];
  if (!peerRange || !Bun.semver.satisfies(brainVersion, peerRange)) {
    throw new PackagePeerCompatibilityError(
      packageMetadata,
      brainVersion,
      peerRange,
    );
  }
}

export function resolveBrainDefinitionDependencies(
  brainPackageRef: string,
  fromDirectory: string,
): InstalledPackageManifest[] {
  const brain = resolveInstalledPackageManifest(brainPackageRef, fromDirectory);
  if (brain.name === "@rizom/brain") return [];

  const runtime = resolveInstalledPackageManifest(
    "@rizom/brain",
    fromDirectory,
  );
  assertBrainPeerCompatibility(brain, runtime.version);

  const definitionDependencies = Object.keys(brain.dependencies)
    .map((dependency) =>
      resolveInstalledPackageManifest(dependency, brain.directory),
    )
    .filter(
      (dependency) => dependency.peerDependencies["@rizom/brain"] !== undefined,
    );
  for (const dependency of definitionDependencies) {
    assertBrainPeerCompatibility(dependency, runtime.version);
  }
  return definitionDependencies;
}
