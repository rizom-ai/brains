import { cpSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import dockerfileTemplate from "./Dockerfile" with { type: "text" };
import kamalDeployTemplate from "./kamal-deploy.yml" with { type: "text" };
export {
  renderDeployWorkflow,
  renderExtractBrainConfigScript,
  renderPreDeployHook,
  renderPublishImageWorkflow,
} from "./scaffold";
export type { DeployWorkflowTemplateOptions } from "./scaffold";

export interface KamalDeployTemplateOptions {
  serviceName: string;
}

// Section header reserved for future bootstrap-credential sections.
// secrets-push uses this marker to skip backend-bootstrap secrets so a
// CI token never gets pushed back into the backend it unlocks.
export const BOOTSTRAP_SECTION_HEADER = "# ---- secret backend bootstrap ----";

export const deployProvisionEnvSchema = `# ---- deploy/provision vars (written by brain init --deploy) ----

# @required @sensitive
HCLOUD_TOKEN=

# @required
HCLOUD_SSH_KEY_NAME=

# @required
HCLOUD_SERVER_TYPE=

# @required
HCLOUD_LOCATION=

# @required @sensitive
KAMAL_SSH_PRIVATE_KEY=

# @required @sensitive
KAMAL_REGISTRY_PASSWORD=

# @required @sensitive
CF_API_TOKEN=

# @required
CF_ZONE_ID=
`;

export const tlsCertEnvSchema = `# ---- TLS cert vars (written by brain cert:bootstrap, consumed by kamal-proxy) ----

# @required @sensitive
CERTIFICATE_PEM=

# @required @sensitive
PRIVATE_KEY_PEM=
`;

export function backendBootstrapEnvSchema(backend: string): string {
  if (backend === "none") {
    return "";
  }

  return `${BOOTSTRAP_SECTION_HEADER}

# Configure the bootstrap credential(s) for the selected backend.
`;
}

export const deployScriptNames = [
  "provision-server.ts",
  "update-dns.ts",
  "validate-secrets.ts",
  "write-kamal-secrets.ts",
  "write-ssh-key.ts",
] as const;

export type DeployScriptName = (typeof deployScriptNames)[number];

export function resolveDeployScriptPath(scriptName: DeployScriptName): string {
  return fileURLToPath(import.meta.resolve(`./deploy-scripts/${scriptName}`));
}

export function copyDeployScripts(
  targetDir: string,
  scriptNames: readonly DeployScriptName[] = deployScriptNames,
): void {
  mkdirSync(targetDir, { recursive: true });
  for (const script of scriptNames) {
    cpSync(resolveDeployScriptPath(script), join(targetDir, script));
  }
}

export function renderDockerfile(): string {
  return dockerfileTemplate;
}

export function renderKamalDeploy(options: KamalDeployTemplateOptions): string {
  return kamalDeployTemplate.replace("__SERVICE_NAME__", options.serviceName);
}

export const REQUIRED_DEPLOY_MOUNTS = [
  "/opt/brain-state:/data",
  "/opt/brain-config:/config",
  "/opt/brain-dist:/app/dist",
] as const;

export function stripDeployVolumes(content: string): string {
  return content.replace(
    /\nvolumes:\n(?: {2}- .*\n)+$/,
    "\nvolumes:\n  - __VOLUMES__\n",
  );
}

export function isStaleDeployMounts(
  current: string,
  serviceName: string,
  normalize: (content: string) => string = (content) => content,
): boolean {
  const normalizedCurrent = normalize(current);
  const normalizedTemplate = normalize(renderKamalDeploy({ serviceName }));

  const hasAllRequiredMounts = REQUIRED_DEPLOY_MOUNTS.every((mount) =>
    normalizedCurrent.includes(mount),
  );

  return (
    !hasAllRequiredMounts &&
    stripDeployVolumes(normalizedCurrent) ===
      stripDeployVolumes(normalizedTemplate)
  );
}
