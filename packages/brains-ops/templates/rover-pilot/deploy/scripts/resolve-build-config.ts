#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { loadPilotRegistry } from "@rizom/ops";
import { writeGitHubEnv, writeGitHubOutput } from "./helpers";

const requestedBrainVersion = process.env["BRAIN_VERSION_INPUT"]?.trim();
const registry = await loadPilotRegistry(process.cwd());
const brainVersion =
  requestedBrainVersion && requestedBrainVersion.length > 0
    ? requestedBrainVersion
    : registry.pilot.brainVersion;

const sitePackages = [
  ...new Set(
    registry.users
      .filter((user) => user.brainVersion === brainVersion)
      .flatMap((user) =>
        user.siteOverride
          ? [`${user.siteOverride.package}@${user.siteOverride.version}`]
          : [],
      ),
  ),
].sort();
const sitePackagesValue = sitePackages.join(" ");
const imageTag = buildImageTag(brainVersion, sitePackages);

writeGitHubEnv("BRAIN_VERSION", brainVersion);
writeGitHubEnv("SITE_PACKAGES", sitePackagesValue);
writeGitHubEnv("IMAGE_TAG", imageTag);
writeGitHubOutput("brain_version", brainVersion);
writeGitHubOutput("site_packages", sitePackagesValue);
writeGitHubOutput("image_tag", imageTag);

console.log(`BRAIN_VERSION=${brainVersion}`);
console.log(`IMAGE_TAG=${imageTag}`);
console.log(
  sitePackages.length > 0
    ? `SITE_PACKAGES=${sitePackagesValue}`
    : "SITE_PACKAGES=(none)",
);

function buildImageTag(brainVersion: string, sitePackages: string[]): string {
  if (sitePackages.length === 0) {
    return `brain-${brainVersion}`;
  }

  const siteHash = createHash("sha256")
    .update(sitePackages.join("\n"))
    .digest("hex")
    .slice(0, 12);

  return `brain-${brainVersion}-sites-${siteHash}`;
}
