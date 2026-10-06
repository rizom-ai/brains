import { readFileSync } from "node:fs";

import { derivePreviewDomain, loadPilotRegistry } from "@rizom/ops";

import {
  parseEnvFile,
  requireEnv,
  runtimeImageTag,
  sitePackagesFor,
  writeGitHubOutput,
} from "./helpers";

const handle = requireEnv("HANDLE");
const envPath = `users/${handle}/.env`;
const brainYamlPath = `users/${handle}/brain.yaml`;

const envEntries = parseEnvFile(envPath);
const repository = process.env["GITHUB_REPOSITORY"] ?? "";
const repositoryOwner = repository.split("/")[0] ?? "";

const brainYaml = readFileSync(brainYamlPath, "utf8");
const domainMatch = brainYaml.match(/^domain:\s*(.+)$/m);
const brainDomain = domainMatch?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
if (!brainDomain) {
  throw new Error(`Missing domain in ${brainYamlPath}`);
}

const registry = await loadPilotRegistry(process.cwd());
const user = registry.users.find((entry) => entry.handle === handle);
if (!user) {
  throw new Error(`Unknown user handle: ${handle}`);
}
const previewDomain = derivePreviewDomain(brainDomain, {
  sharedDomain: registry.pilot.domainSuffix,
});
const wwwDomain = isFleetDomain(
  handle,
  brainDomain,
  registry.pilot.domainSuffix,
)
  ? ""
  : `www.${brainDomain}`;

const brainVersion = envEntries["BRAIN_VERSION"] ?? "";

// Build and Deploy share one tag function: an instance runs the immutable
// image named by its Brain version and its own site pins. The generated env
// names the same image; a disagreement means the registry moved under it.
const imageTag = runtimeImageTag(
  brainVersion,
  sitePackagesFor(user.siteOverride),
);
const generatedTag = envEntries["IMAGE_TAG"];
if (generatedTag && generatedTag !== imageTag) {
  throw new Error(
    `${envPath} names ${generatedTag} but the registry resolves ${imageTag}; reconcile first`,
  );
}

const outputs: Record<string, string> = {
  brain_version: brainVersion,
  content_repo: envEntries["CONTENT_REPO"] ?? "",
  brain_domain: brainDomain,
  preview_domain: previewDomain,
  www_domain: wwwDomain,
  cloudflare_zone_id: user.cloudflareZoneId ?? process.env["CF_ZONE_ID"] ?? "",
  brain_yaml_path: brainYamlPath,
  instance_name: `rover-${handle}`,
  image_repository: `ghcr.io/${repository}`,
  image_tag: imageTag,
  registry_username: repositoryOwner,
};

const required = ["brain_version", "registry_username"];
for (const key of required) {
  if (!outputs[key]) {
    throw new Error(`Missing ${key} (derived from ${envPath})`);
  }
}

for (const [key, value] of Object.entries(outputs)) {
  writeGitHubOutput(key, value);
}

function isFleetDomain(
  userHandle: string,
  domain: string,
  pilotDomainSuffix: string,
): boolean {
  return domain === `${userHandle}${pilotDomainSuffix}`;
}
