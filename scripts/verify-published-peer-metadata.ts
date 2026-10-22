#!/usr/bin/env bun
import {
  assertPublishedCompatibilityMetadata,
  type PublishedCompatibilityTarget,
  type PublishedPackageManifest,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";
import { readPackageManifestFromTarball } from "./lib/package-tarball";
import { findSitePublishTargets } from "./lib/site-publish-targets";
import { RegistryNotReady, untilPublished } from "./lib/registry-propagation";

interface RegistryVersionMetadata extends PublishedPackageManifest {
  dist?: { tarball?: string };
}

const repositoryRoot = process.cwd();
const packages = await getPackages(repositoryRoot);
const targets = findSitePublishTargets(packages.packages).map(
  ({ target }) => target,
);

await Promise.all(targets.map((target) => verifyWithRetries(target)));
console.log(
  `Verified published peer metadata for ${targets.length} site/theme packages.`,
);

/**
 * Only propagation/fetch failures are retried, within the registry deadline. A
 * compatibility violation is a real defect in what was published: it fails at
 * once and is named, never reported as "metadata is not ready".
 */
async function verifyWithRetries(
  target: PublishedCompatibilityTarget,
): Promise<void> {
  await untilPublished(async () => {
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
  });
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
    throw new RegistryNotReady(
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
    throw new RegistryNotReady(
      `${target.name}@${target.version} registry metadata has no dist.tarball`,
    );
  }

  const response = await fetch(tarballUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new RegistryNotReady(
      `Tarball download returned ${response.status} for ${target.name}@${target.version}`,
    );
  }

  return readPackageManifestFromTarball(
    await response.blob(),
    `${target.name}@${target.version}`,
  );
}
