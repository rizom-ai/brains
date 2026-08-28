#!/usr/bin/env bun
import {
  assertPublishedCompatibilityMetadata,
  type PublishedCompatibilityTarget,
  type PublishedPackageManifest,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";
import { readPackageManifestFromTarball } from "./lib/package-tarball";

interface RegistryVersionMetadata extends PublishedPackageManifest {
  dist?: { tarball?: string };
}

/**
 * A fetch/propagation failure that is worth retrying. Compatibility violations
 * are NOT transient: retrying them only delays and obscures the failure, which
 * is how a real packument corruption was reported as "metadata is not ready"
 * for eight attempts instead of being named on the first.
 */
class TransientRegistryError extends Error {}

const repositoryRoot = process.cwd();
const maxAttempts = parsePositiveInteger(
  process.env["PUBLISHED_METADATA_ATTEMPTS"],
  8,
);
const packages = await getPackages(repositoryRoot);
const targets: PublishedCompatibilityTarget[] = [];

for (const { packageJson } of packages.packages) {
  const name = packageJson.name;
  const scripts = (packageJson as { scripts?: Record<string, string> }).scripts;
  if (
    packageJson.private === true ||
    scripts?.["prepack"] !== "publish-manifest prepare" ||
    (!name.startsWith("@rizom/site-") && !name.startsWith("@rizom/theme-"))
  ) {
    continue;
  }

  const manifest = packageJson as Record<string, unknown>;
  const authoringPeers = manifest["publishPeerDependencies"];
  const brainRange = isRecord(authoringPeers)
    ? authoringPeers["@rizom/brain"]
    : undefined;
  if (typeof brainRange !== "string") {
    throw new Error(
      `${name} is a deployable site/theme package but does not declare publishPeerDependencies["@rizom/brain"]`,
    );
  }
  targets.push({ name, version: packageJson.version, brainRange });
}

if (targets.length === 0) {
  throw new Error("No deployable site/theme compatibility targets found");
}

await Promise.all(targets.map((target) => verifyWithRetries(target)));
console.log(
  `Verified published peer metadata for ${targets.length} site/theme packages.`,
);

async function verifyWithRetries(
  target: PublishedCompatibilityTarget,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const registryManifest = await fetchRegistryManifest(target);
      assertPublishedCompatibilityMetadata(
        target,
        registryManifest,
        "registry packument",
      );
      const tarballManifest = await fetchTarballManifest(
        target,
        registryManifest,
      );
      assertPublishedCompatibilityMetadata(
        target,
        tarballManifest,
        "tarball manifest",
      );
      console.log(`✓ ${target.name}@${target.version}`);
      return;
    } catch (error) {
      lastError = error;
      // Only propagation/fetch failures are retryable. A compatibility
      // violation is a real defect in what was published: fail fast and name it.
      if (!(error instanceof TransientRegistryError)) {
        throw error;
      }
      if (attempt === maxAttempts) {
        break;
      }
      const delayMs = Math.min(2_000 * 2 ** (attempt - 1), 15_000);
      console.warn(
        `Registry metadata for ${target.name}@${target.version} is not ready (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs / 1_000}s.`,
      );
      await Bun.sleep(delayMs);
    }
  }

  throw lastError;
}

async function fetchRegistryManifest(
  target: PublishedCompatibilityTarget,
): Promise<RegistryVersionMetadata> {
  const registry =
    process.env["NPM_CONFIG_REGISTRY"] ??
    process.env["npm_config_registry"] ??
    "https://registry.npmjs.org";
  const baseUrl = registry.endsWith("/") ? registry : `${registry}/`;
  const url = new URL(
    `${encodeURIComponent(target.name)}/${encodeURIComponent(target.version)}`,
    baseUrl,
  );
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new TransientRegistryError(
      `Registry returned ${response.status} for ${target.name}@${target.version}`,
    );
  }
  return (await response.json()) as RegistryVersionMetadata;
}

async function fetchTarballManifest(
  target: PublishedCompatibilityTarget,
  registryManifest: RegistryVersionMetadata,
): Promise<PublishedPackageManifest> {
  const tarballUrl = registryManifest.dist?.tarball;
  if (typeof tarballUrl !== "string") {
    throw new TransientRegistryError(
      `${target.name}@${target.version} registry metadata has no dist.tarball`,
    );
  }

  const response = await fetch(tarballUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new TransientRegistryError(
      `Tarball download returned ${response.status} for ${target.name}@${target.version}`,
    );
  }

  return readPackageManifestFromTarball(
    await response.blob(),
    `${target.name}@${target.version}`,
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
