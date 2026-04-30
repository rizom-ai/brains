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
export type {
  DeployWorkflowTemplateOptions,
  PreDeployHookTemplateOptions,
} from "./scaffold";

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

export const legacyStandaloneDeployYmlContents = [
  `service: brain
image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl: true
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>:80
    - preview.<%= ENV['BRAIN_DOMAIN'] %>:81
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: rizom-ai
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain-dist:/app/dist
  - /opt/brain.yaml:/app/brain.yaml
`,
];

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

function normalizeStandaloneDeployYmlForComparison(content: string): string {
  return content
    .replace(
      /\n {2}secret:\n(?: {4}- .*\n)+\nvolumes:\n/,
      "\n  secret:\n    - __DYNAMIC_SECRETS__\n\nvolumes:\n",
    )
    .replace(
      /\n {4}- <%= ENV\['BRAIN_DOMAIN'\] %>\n {4}- [^\n]+\n {2}app_port: /,
      "\n    - <%= ENV['BRAIN_DOMAIN'] %>\n    - __PREVIEW_HOST__\n  app_port: ",
    );
}

function isStaleStandaloneDeployMounts(current: string): boolean {
  return isStaleDeployMounts(
    current,
    "brain",
    normalizeStandaloneDeployYmlForComparison,
  );
}

export function matchesLegacyStandaloneDeployYml(current: string): boolean {
  const normalized = normalizeStandaloneDeployYmlForComparison(current);

  return (
    normalized ===
      `service: brain
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - __PREVIEW_HOST__
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - __DYNAMIC_SECRETS__

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
` || isStaleStandaloneDeployMounts(current)
  );
}
