import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

const onePasswordBootstrapEnvSchema = (
  instanceName: string,
): string => `# @plugin(@varlock/1password-plugin)
# @initOp(token=$OP_TOKEN)
# @setValuesBulk(opLoadVault(brain-${instanceName}-prod))
`;

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

# @required
BRAIN_MODEL=

# @required
BRAIN_DOMAIN=
`;

const tlsCertEnvSchema = `# ---- TLS cert vars (written by brain cert:bootstrap, consumed by kamal-proxy) ----

# @required @sensitive
CERTIFICATE_PEM=

# @required @sensitive
PRIVATE_KEY_PEM=
`;

const backendBootstrapEnvSchema = `# ---- secret backend bootstrap ----

# @type=opServiceAccountToken @required @sensitive
OP_TOKEN=
`;

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
): string {
  const sections = [
    onePasswordBootstrapEnvSchema(instanceName).trimEnd(),
    readModelEnvSchema(model),
    deployProvisionEnvSchema.trimEnd(),
    tlsCertEnvSchema.trimEnd(),
    backendBootstrapEnvSchema.trimEnd(),
  ].filter((section) => section.length > 0);

  return `${sections.join("\n\n")}\n`;
}
