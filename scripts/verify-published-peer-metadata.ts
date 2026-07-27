#!/usr/bin/env bun
import {
  assertPublishedCompatibilityMetadata,
  type PublishedCompatibilityTarget,
  type PublishedPackageManifest,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RegistryVersionMetadata extends PublishedPackageManifest {
  dist?: { tarball?: string };
}

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
    throw new Error(
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
    throw new Error(
      `${target.name}@${target.version} registry metadata has no dist.tarball`,
    );
  }

  const response = await fetch(tarballUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Tarball download returned ${response.status} for ${target.name}@${target.version}`,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "published-peer-metadata-"));
  const tarballPath = join(dir, "package.tgz");
  try {
    await writeFile(tarballPath, new Uint8Array(await response.arrayBuffer()));
    const child = Bun.spawn(
      ["tar", "-xOf", tarballPath, "package/package.json"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `Could not read package.json from ${target.name}@${target.version} tarball: ${stderr.trim()}`,
      );
    }
    return JSON.parse(stdout) as PublishedPackageManifest;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
