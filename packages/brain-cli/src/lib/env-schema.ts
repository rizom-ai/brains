import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import {
  BOOTSTRAP_SECTION_HEADER,
  backendBootstrapEnvSchema,
  deployProvisionEnvSchema,
  tlsCertEnvSchema,
} from "@brains/deploy-support";
import { canonicalEnvSchema } from "./generated/canonical-env-schema";

const DEFAULT_SECRET_BACKEND = "none";

export { BOOTSTRAP_SECTION_HEADER };

const BITWARDEN_PLUGIN_DECORATOR = "@plugin(@varlock/bitwarden-plugin";

export const BITWARDEN_BOOTSTRAP_TOKEN_NAMES: ReadonlySet<string> = new Set([
  "BWS_ACCESS_TOKEN",
  "BITWARDEN_ACCESS_TOKEN",
]);

export function hasBitwardenPlugin(envSchema: string): boolean {
  return envSchema.includes(BITWARDEN_PLUGIN_DECORATOR);
}

function normalizeSecretBackend(backend?: string): string {
  const value = backend?.trim();
  if (!value) return DEFAULT_SECRET_BACKEND;
  return value.startsWith("@") ? value : value.toLowerCase();
}

function resolvePluginName(backend: string): string {
  if (backend.startsWith("@")) return backend;
  if (backend.includes("/")) return `@${backend}`;
  if (backend.endsWith("-plugin")) return `@varlock/${backend}`;
  return `@varlock/${backend}-plugin`;
}

function secretBackendPrelude(_instanceName: string, backend: string): string {
  if (backend === "none") return "";
  return `# @plugin(${resolvePluginName(backend)})\n`;
}

function resolveDefinitionPackageDir(definition: string): string {
  const packageName = definition === "brain" ? "@rizom/brain" : definition;
  return dirname(
    new URL(import.meta.resolve(`${packageName}/package.json`)).pathname,
  );
}

function resolveDefinitionEnvSchemaPath(
  packageDirectory: string,
): string | undefined {
  for (const filename of ["env.schema.template", ".env.schema"]) {
    const path = join(packageDirectory, filename);
    if (existsSync(path)) return path;
  }
  return undefined;
}

export function resolveDefinitionEnvSchema(
  definition: string,
  resolvePackageDir: (
    definition: string,
  ) => string = resolveDefinitionPackageDir,
): string {
  try {
    const schemaPath = resolveDefinitionEnvSchemaPath(
      resolvePackageDir(definition),
    );
    if (schemaPath) return readFileSync(schemaPath, "utf-8").trimEnd();
  } catch {
    // Published bundles use the generated canonical fallback.
  }
  return definition === "brain" ? canonicalEnvSchema : "";
}

export function buildInstanceEnvSchema(
  definition: string,
  instanceName: string = definition,
  backend?: string,
): string {
  const selectedBackend = normalizeSecretBackend(backend);
  const sections = [
    secretBackendPrelude(instanceName, selectedBackend).trimEnd(),
    resolveDefinitionEnvSchema(definition),
    deployProvisionEnvSchema.trimEnd(),
    tlsCertEnvSchema.trimEnd(),
    backendBootstrapEnvSchema(selectedBackend).trimEnd(),
  ].filter((section) => section.length > 0);

  return `${sections.join("\n\n")}\n`;
}
