import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { bundledModelEnvSchemas } from "./generated/bundled-model-env-schemas";

// "none" means: no varlock plugin in the schema. Values resolve from
// process.env (and therefore from CI secrets) directly. This is the
// only backend brain-cli ships with verified end-to-end support today.
// 1Password and Bitwarden were both considered and rejected — see
// Verified secret-backend blockers are documented in repo docs; keep defaults conservative until an end-to-end backend path is proven.
// Operators who want a different varlock plugin can pass --backend
// <name>; the schema generator emits a generic @plugin(@varlock/<name>-plugin)
// fallthrough that they can hand-tune.
const DEFAULT_SECRET_BACKEND = "none";

// Section header reserved for future bootstrap-credential sections.
// secrets-push uses this marker to skip backend-bootstrap secrets so a
// CI token never gets pushed back into the backend it unlocks.
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

  if (backend.includes("/")) {
    return `@${backend}`;
  }

  if (backend.endsWith("-plugin")) {
    return `@varlock/${backend}`;
  }

  return `@varlock/${backend}-plugin`;
}

function secretBackendPrelude(_instanceName: string, backend: string): string {
  if (backend === "none") {
    return "";
  }

  const pluginName = resolvePluginName(backend);
  return `# @plugin(${pluginName})
`;
}

const deployProvisionEnvSchema = `# ---- deploy/provision vars (written by brain init --deploy) ----

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

function normalizeModelName(model: string): string {
  return model.startsWith("@brains/") ? model.slice("@brains/".length) : model;
}

function getBundledModelEnvSchema(model: string): string {
  switch (normalizeModelName(model)) {
    case "rover":
      return bundledModelEnvSchemas.rover;
    case "ranger":
      return bundledModelEnvSchemas.ranger;
    case "relay":
      return bundledModelEnvSchemas.relay;
    default:
      return "";
  }
}

export function resolveModelEnvSchema(
  model: string,
  resolvePackageDir: (model: string) => string = resolveBrainPackageDir,
): string {
  try {
    const brainPackageDir = resolvePackageDir(model);
    const schemaPath = resolveModelEnvSchemaPath(brainPackageDir);
    if (schemaPath) {
      return readFileSync(schemaPath, "utf-8").trimEnd();
    }
  } catch {
    // Fall through to bundled built-in schemas for published installs.
  }

  return getBundledModelEnvSchema(model);
}

export function buildInstanceEnvSchema(
  model: string,
  instanceName = model,
  backend?: string,
): string {
  const selectedBackend = normalizeSecretBackend(backend);
  const sections = [
    secretBackendPrelude(instanceName, selectedBackend).trimEnd(),
    resolveModelEnvSchema(model),
    deployProvisionEnvSchema.trimEnd(),
    tlsCertEnvSchema.trimEnd(),
    backendBootstrapEnvSchema(selectedBackend).trimEnd(),
  ].filter((section) => section.length > 0);

  return `${sections.join("\n\n")}\n`;
}
