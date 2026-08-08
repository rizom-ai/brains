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
export {
  readJsonResponse,
  parseEnvFile,
  parseEnvSchema,
  parseEnvSchemaFile,
  requireEnv,
  writeGitHubOutput,
  writeGitHubEnv,
  type EnvSchemaEntry,
} from "./ci";
export {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "./local-env";

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

/**
 * Canonical deploy scripts live in src/deploy-scripts/. They are copied
 * verbatim into scaffolded user projects (where workspace imports cannot
 * resolve), so they must stay self-contained apart from "./helpers".
 *
 * brain-cli (templates/deploy/scripts) and brains-ops
 * (templates/rover-pilot/deploy/scripts) commit generated copies that their
 * scripts/build.ts regenerate via copyDeployScripts. Never edit those copies
 * by hand — edit src/deploy-scripts/ here; each package's
 * package-metadata.test.ts fails on drift.
 */
export const deployScriptNames = [
  "install-health-watchdog.ts",
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

/**
 * One stable string per generated deploy script, present in every generated
 * vintage of that script. A committed copy that still contains its fingerprint
 * but no longer matches the canonical source is a stale generated copy and
 * safe to rewrite on init; content without the fingerprint is treated as
 * owner-customized and left alone.
 */
const deployScriptFingerprints: Record<DeployScriptName, string> = {
  "install-health-watchdog.ts": "/usr/local/sbin/brains-health-watchdog",
  "provision-server.ts": 'requireEnv("HCLOUD_TOKEN")',
  "update-dns.ts": 'requireEnv("CF_API_TOKEN")',
  "validate-secrets.ts": "const requiredKeys = schema",
  "write-kamal-secrets.ts": ".kamal/secrets",
  "write-ssh-key.ts": 'requireEnv("KAMAL_SSH_PRIVATE_KEY")',
};

export function isStaleDeployScript(
  script: DeployScriptName,
  current: string,
  canonical: string,
): boolean {
  if (current === canonical) {
    return false;
  }
  return current.includes(deployScriptFingerprints[script]);
}

export function renderDockerfile(): string {
  return dockerfileTemplate;
}

/** Match the previously generated shared runtime image without claiming custom Dockerfiles. */
export function isStaleDeployDockerfile(content: string): boolean {
  const hasCurrentRuntime =
    content.includes('LABEL ai.rizom.brain.watchdog="true"') &&
    content.includes("http://127.0.0.1:8080/health/live") &&
    content.includes('ENTRYPOINT ["/usr/bin/tini", "--"]') &&
    content.includes(
      'CMD ["bun", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
    );
  if (hasCurrentRuntime) return false;

  const hasGeneratedCommand =
    content.includes('CMD ["./node_modules/.bin/brain", "start"]') ||
    content.includes(
      'CMD ["bun", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
    );
  return (
    hasGeneratedCommand &&
    [
      "ARG BUN_VERSION=",
      "FROM oven/bun:${BUN_VERSION}-slim AS runtime",
      "FROM runtime AS standalone",
      "FROM runtime AS fleet",
      "bunx playwright-core install --with-deps chromium-headless-shell",
    ].every((marker) => content.includes(marker))
  );
}

export function renderKamalDeploy(options: KamalDeployTemplateOptions): string {
  return kamalDeployTemplate.replace("__SERVICE_NAME__", options.serviceName);
}

export const legacyStandaloneDeployYmlContents: readonly string[] = [
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
  "/opt/brain-runtime:/app/data",
  "/opt/brain-state:/data",
  "/opt/brain-config:/config",
  "/opt/brain-dist:/app/dist",
] as const;

// Replaces the trailing `volumes:` list with a placeholder so two deploy.yml
// files can be compared on structure without their mount lists clashing.
export function stripDeployVolumes(content: string): string {
  return content.replace(
    /\nvolumes:\n(?: {2}- .*\n)+$/,
    "\nvolumes:\n  - __VOLUMES__\n",
  );
}

// Drops the optional WWW_DOMAIN ERB conditional block. Different on-disk
// templates may or may not include it, but the surrounding YAML matches.
function normalizeOptionalWwwDeployHost(content: string): string {
  return content.replace(
    /\n {4}# <% if ENV\['WWW_DOMAIN'\] && !ENV\['WWW_DOMAIN'\]\.empty\? %>\n {4}- <%= ENV\['WWW_DOMAIN'\] %>\n {4}# <% end %>/,
    "",
  );
}

export function isStaleDeployMounts(
  current: string,
  serviceName: string,
  normalize: (content: string) => string = (content) => content,
): boolean {
  const normalizedCurrent = normalizeOptionalWwwDeployHost(normalize(current));
  const normalizedTemplate = normalizeOptionalWwwDeployHost(
    normalize(renderKamalDeploy({ serviceName })),
  );

  const hasAllRequiredMounts = REQUIRED_DEPLOY_MOUNTS.every((mount) =>
    normalizedCurrent.includes(mount),
  );
  const previousHealthcheckTemplate = normalizedTemplate.replace(
    "path: /health/ready",
    "path: /health",
  );

  const strippedCurrent = stripDeployVolumes(normalizedCurrent);
  return (
    normalizedCurrent === previousHealthcheckTemplate ||
    (!hasAllRequiredMounts &&
      (strippedCurrent === stripDeployVolumes(normalizedTemplate) ||
        strippedCurrent === stripDeployVolumes(previousHealthcheckTemplate)))
  );
}

// Maps the older standalone deploy.yml shape onto a canonical form so the
// two can be string-compared. Three normalizations:
//   1. collapse the multi-line `secret:` list — legacy hard-codes 4 entries,
//      canonical varies — to a single placeholder.
//   2. drop the optional WWW host conditional (varies independently).
//   3. replace the second proxy `hosts:` entry with __PREVIEW_HOST__ since
//      legacy emits `preview.${DOMAIN}` while canonical uses ENV['PREVIEW_DOMAIN'].
function normalizeStandaloneDeployYmlForComparison(content: string): string {
  return content
    .replace(
      /\n {2}secret:\n(?: {4}- .*\n)+\nvolumes:\n/,
      "\n  secret:\n    - __DYNAMIC_SECRETS__\n\nvolumes:\n",
    )
    .replace(
      /\n {4}# <% if ENV\['WWW_DOMAIN'\] && !ENV\['WWW_DOMAIN'\]\.empty\? %>\n {4}- <%= ENV\['WWW_DOMAIN'\] %>\n {4}# <% end %>/,
      "",
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

// Expected normalized form of an older standalone deploy.yml. Can't be
// derived from the current canonical template — they differ in app_port
// (80 vs 8080) and shipped volume list — so we keep a separate literal.
const LEGACY_STANDALONE_DEPLOY_YML_NORMALIZED = `service: brain
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
`;

export function matchesLegacyStandaloneDeployYml(current: string): boolean {
  const normalized = normalizeStandaloneDeployYmlForComparison(current);
  return (
    normalized === LEGACY_STANDALONE_DEPLOY_YML_NORMALIZED ||
    isStaleStandaloneDeployMounts(current)
  );
}
