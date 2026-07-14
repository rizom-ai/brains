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

const zone =
  brainDomain.startsWith(`${handle}.`) && brainDomain.length > handle.length + 1
    ? brainDomain.slice(handle.length + 1)
    : "";
if (!zone) {
  throw new Error(`Could not derive preview domain from ${brainDomain}`);
}
const previewDomain = `${handle}-preview.${zone}`;

const brainVersion = envEntries["BRAIN_VERSION"] ?? "";

// The image tag is a pure function of this instance's own config: plain
// `brain-{version}` for a default instance, or its own `brain-{version}-sites-
// {hash}` when it declares a siteOverride. Resolved through the same helper the
// build uses so the tag we wait for and run matches exactly what was pushed.
const registry = await loadPilotRegistry(process.cwd());
const user = registry.users.find((entry) => entry.handle === handle);
const sitePackages = sitePackagesFor(user?.siteOverride);
const imageTag = siteImageTag(brainVersion, sitePackages);

const outputs: Record<string, string> = {
  brain_version: brainVersion,
  content_repo: envEntries["CONTENT_REPO"] ?? "",
  brain_domain: brainDomain,
  preview_domain: previewDomain,
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
