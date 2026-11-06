#!/usr/bin/env bun
import {
  assertPublishedCompatibilityMetadata,
  runWithPreparedPublishManifests,
  type PublishedPackageManifest,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findSitePublishTargets } from "./lib/site-publish-targets";

const repositoryRoot = process.cwd();
const packages = await getPackages(repositoryRoot);
const targets = findSitePublishTargets(packages.packages);

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
