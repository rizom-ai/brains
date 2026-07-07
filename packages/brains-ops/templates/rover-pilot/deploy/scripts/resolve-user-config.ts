import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadPilotRegistry } from "@rizom/ops";

import { parseEnvFile, requireEnv, writeGitHubOutput } from "./helpers";

const handle = requireEnv("HANDLE");
const envPath = `users/${handle}/.env`;
const brainYamlPath = `users/${handle}/brain.yaml`;

const envEntries = parseEnvFile(envPath);
const brainVersion = envEntries["BRAIN_VERSION"] ?? "";
const imageTag = await resolveImageTag(brainVersion);
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

async function resolveImageTag(brainVersion: string): Promise<string> {
  if (!brainVersion) {
    return "";
  }

  const registry = await loadPilotRegistry(process.cwd());
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

  if (sitePackages.length === 0) {
    return `brain-${brainVersion}`;
  }

  const siteHash = createHash("sha256")
    .update(sitePackages.join("\n"))
    .digest("hex")
    .slice(0, 12);

  return `brain-${brainVersion}-sites-${siteHash}`;
}
