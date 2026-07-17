import { readFileSync } from "node:fs";

import { loadPilotRegistry } from "@rizom/ops";

import {
  parseEnvFile,
  requireEnv,
  sitePackagesFor,
  siteImageTag,
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
const previewDomain = resolvePreviewDomain(
  handle,
  brainDomain,
  registry.pilot.domainSuffix,
);
const wwwDomain = isFleetDomain(
  handle,
  brainDomain,
  registry.pilot.domainSuffix,
)
  ? ""
  : `www.${brainDomain}`;

const brainVersion = envEntries["BRAIN_VERSION"] ?? "";

// The image tag is a pure function of this instance's own config: plain
// `brain-{version}` for a default instance, or its own `brain-{version}-sites-
// {hash}` when it declares a siteOverride. Resolved through the same helper the
// build uses so the tag we wait for and run matches exactly what was pushed.
const sitePackages = sitePackagesFor(user.siteOverride);
const imageTag = siteImageTag(brainVersion, sitePackages);

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

function resolvePreviewDomain(
  userHandle: string,
  domain: string,
  pilotDomainSuffix: string,
): string {
  if (!isFleetDomain(userHandle, domain, pilotDomainSuffix)) {
    return `preview.${domain}`;
  }

  const fleetZone = pilotDomainSuffix.replace(/^\./, "");
  if (!fleetZone) {
    throw new Error(`Could not derive preview domain from ${domain}`);
  }

  return `${userHandle}-preview.${fleetZone}`;
}

function isFleetDomain(
  userHandle: string,
  domain: string,
  pilotDomainSuffix: string,
): boolean {
  return domain === `${userHandle}${pilotDomainSuffix}`;
}
