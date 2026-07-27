#!/usr/bin/env bun
import {
  assertPublishedCompatibilityMetadata,
  runWithPreparedPublishManifests,
  type PublishedCompatibilityTarget,
  type PublishedPackageManifest,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const packages = await getPackages(repositoryRoot);
const targets: Array<{
  dir: string;
  target: PublishedCompatibilityTarget;
}> = [];

for (const { dir, packageJson } of packages.packages) {
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
  targets.push({
    dir,
    target: { name, version: packageJson.version, brainRange },
  });
}

if (targets.length === 0) {
  throw new Error("No deployable site/theme compatibility targets found");
}

await runWithPreparedPublishManifests(
  targets.map(({ dir }) => dir),
  async () => {
    for (const { dir, target } of targets) {
      const manifest = JSON.parse(
        await readFile(join(dir, "package.json"), "utf8"),
      ) as PublishedPackageManifest;
      assertPublishedCompatibilityMetadata(
        target,
        manifest,
        "tarball manifest",
      );
      console.log(`✓ ${target.name}@${target.version}`);
    }
  },
);

console.log(
  `Verified pre-publish metadata for ${targets.length} site/theme packages.`,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
