import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

// "none" means: no varlock plugin in the schema. Values resolve from
// process.env (and therefore from CI secrets) directly. This is the
// default so that brain init works for any operator without forcing a
// 1Password / Bitwarden / Vault subscription. Operators who want a real
// secret manager opt in via --backend 1password (the only varlock backend
// today that ships a working bulk-load plugin — see
// docs/plans/bitwarden-secret-backend.md for the rejected alternative).
const DEFAULT_SECRET_BACKEND = "none";
const ONE_PASSWORD_PLUGIN = "@varlock/1password-plugin";

// Section header consumed by `secrets-push` to identify keys that
// belong to the secret-backend bootstrap (e.g. OP_TOKEN) and must
// not be pushed back into the backend they unlock.
export const BOOTSTRAP_SECTION_HEADER = "# ---- secret backend bootstrap ----";

function normalizeSecretBackend(backend?: string): string {
  const value = backend?.trim();
  if (!value) {
    return DEFAULT_SECRET_BACKEND;
  }

  return value.startsWith("@") ? value : value.toLowerCase();
}

function resolvePluginName(backend: string): string {
  if (backend.startsWith("@")) {
    return backend;
  }

  if (backend === "1password") {
    return ONE_PASSWORD_PLUGIN;
  }

  if (backend.includes("/")) {
    return `@${backend}`;
  }

  if (backend.endsWith("-plugin")) {
    return `@varlock/${backend}`;
  }

  return `@varlock/${backend}-plugin`;
}

function secretBackendPrelude(instanceName: string, backend: string): string {
  if (backend === "none") {
    return "";
  }

  const pluginName = resolvePluginName(backend);

  if (backend === "1password") {
    return `# @plugin(${pluginName})
# @initOp(token=$OP_TOKEN)
# @setValuesBulk(opLoadVault(brain-${instanceName}-prod))
`;
  }

  return `# @plugin(${pluginName})
`;
}

const deployProvisionEnvSchema = `# ---- deploy/provision vars (written by brain init --deploy) ----

# @required @sensitive
HCLOUD_TOKEN=

# @required
HCLOUD_SSH_KEY_NAME=

# @required @sensitive
KAMAL_SSH_PRIVATE_KEY=

# @required @sensitive
KAMAL_REGISTRY_PASSWORD=

# @required @sensitive
CF_API_TOKEN=

# @required
CF_ZONE_ID=
`;

const tlsCertEnvSchema = `# ---- TLS cert vars (written by brain cert:bootstrap, consumed by kamal-proxy) ----

# @required @sensitive
CERTIFICATE_PEM=

# @required @sensitive
PRIVATE_KEY_PEM=
`;

function backendBootstrapEnvSchema(backend: string): string {
  if (backend === "none") {
    return "";
  }

  if (backend === "1password") {
    return `${BOOTSTRAP_SECTION_HEADER}

# @type=opServiceAccountToken @required @sensitive
OP_TOKEN=
`;
  }

  return `${BOOTSTRAP_SECTION_HEADER}

# Configure the bootstrap credential(s) for the selected backend.
`;
}

function resolveBrainPackageDir(model: string): string {
  const brainPackage = model.startsWith("@") ? model : `@brains/${model}`;
  return dirname(
    new URL(import.meta.resolve(`${brainPackage}/package.json`)).pathname,
  );
}

function resolveModelEnvSchemaPath(
  brainPackageDir: string,
): string | undefined {
  const templatePath = join(brainPackageDir, "env.schema.template");
  if (existsSync(templatePath)) {
    return templatePath;
  }

  const legacyPath = join(brainPackageDir, ".env.schema");
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  return undefined;
}

function readModelEnvSchema(model: string): string {
  const brainPackageDir = resolveBrainPackageDir(model);
  const schemaPath = resolveModelEnvSchemaPath(brainPackageDir);
  if (!schemaPath) {
    return "";
  }

  return readFileSync(schemaPath, "utf-8").trimEnd();
}

export function buildInstanceEnvSchema(
  model: string,
  instanceName = model,
  backend?: string,
): string {
  const selectedBackend = normalizeSecretBackend(backend);
  const sections = [
    secretBackendPrelude(instanceName, selectedBackend).trimEnd(),
    readModelEnvSchema(model),
    deployProvisionEnvSchema.trimEnd(),
    tlsCertEnvSchema.trimEnd(),
    backendBootstrapEnvSchema(selectedBackend).trimEnd(),
  ].filter((section) => section.length > 0);

  return `${sections.join("\n\n")}\n`;
}
