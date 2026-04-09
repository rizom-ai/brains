import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { parseEnv } from "node:util";
import {
  normalizePushTarget,
  resolveOpToken,
  vaultNameForInstance,
  type PushTarget,
} from "../lib/push-target";
import { pushSecretsToBackend } from "../lib/push-secrets";
import { type RunCommand } from "../lib/run-subprocess";
import { BOOTSTRAP_SECTION_HEADER } from "../lib/env-schema";

export interface SecretsPushOptions {
  env?: NodeJS.ProcessEnv | undefined;
  logger?: (message: string) => void;
  opToken?: string | undefined;
  pushTo?: string | undefined;
  all?: boolean | undefined;
  only?: string | undefined;
  dryRun?: boolean | undefined;
  runCommand?: RunCommand | undefined;
}

export interface SecretsPushResult {
  target: PushTarget;
  pushedKeys: string[];
  skippedKeys: string[];
  vaultName?: string | undefined;
  dryRun?: boolean | undefined;
}

interface SchemaSecretInfo {
  key: string;
  required: boolean;
}

const CERTIFICATE_SECRET_NAMES = new Set([
  "CERTIFICATE_PEM",
  "PRIVATE_KEY_PEM",
]);
const BOOTSTRAP_SECRET_NAMES = new Set(["OP_TOKEN"]);

export async function runSecretsPush(
  cwd: string,
  options: SecretsPushOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await pushSecrets(cwd, options);
    return {
      success: true,
      message: result.dryRun
        ? `Dry run: would push ${result.pushedKeys.length} secrets to ${result.target}`
        : `Pushed ${result.pushedKeys.length} secrets to ${result.target}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Secret push failed",
    };
  }
}

export async function pushSecrets(
  cwd: string,
  options: SecretsPushOptions = {},
): Promise<SecretsPushResult> {
  const target = normalizePushTarget(options.pushTo);
  if (!target) {
    throw new Error(
      "Missing --push-to value. Use --push-to 1password or --push-to gh",
    );
  }
  const logger = options.logger ?? console.log;
  const env = options.env ?? process.env;

  const schemaPath = resolveSchemaPath(cwd);
  const localEnvValues = readLocalEnvValues(join(cwd, ".env"));
  const schemaSecrets = readSecretSchema(schemaPath);
  const allowedKeys = schemaSecrets.map((secret) => secret.key);
  const schemaSecretInfo = new Map(
    schemaSecrets.map((secret) => [secret.key, secret]),
  );
  const candidateKeys = selectCandidateKeys(
    allowedKeys,
    localEnvValues,
    options.all ?? false,
    parseOnlyKeys(options.only),
  );
  const { pushedKeys, skippedKeys } = collectSecretValues(
    candidateKeys,
    env,
    localEnvValues,
  );

  if (pushedKeys.length === 0) {
    throw new Error(
      `No local secrets found in ${schemaPath ? basename(schemaPath) : ".env"}`,
    );
  }

  const pushedSecretNames = pushedKeys.map(([key]) => key);

  if (options.dryRun) {
    const vaultName =
      target === "1password" ? vaultNameForInstance(cwd) : undefined;
    const destination =
      target === "1password"
        ? `1Password vault ${vaultName}`
        : "GitHub Secrets";
    logger(
      `Dry run: would push ${pushedSecretNames.length} secrets to ${destination}.`,
    );
    if (pushedSecretNames.length > 0) {
      logger(`Secrets: ${pushedSecretNames.join(", ")}`);
    }
    logMissingSecrets(logger, skippedKeys, schemaSecretInfo);

    return {
      target,
      vaultName,
      pushedKeys: pushedSecretNames,
      skippedKeys,
      dryRun: true,
    };
  }

  const opToken = resolveOpToken(env, options.opToken);
  const result = await pushSecretsToBackend(target, pushedKeys, {
    cwd,
    opToken,
    runCommand: options.runCommand,
    logger,
  });

  logMissingSecrets(logger, skippedKeys, schemaSecretInfo);

  return {
    target,
    vaultName: result.vaultName,
    pushedKeys: pushedSecretNames,
    skippedKeys,
  };
}

function resolveSchemaPath(cwd: string): string | undefined {
  const candidates = [
    join(cwd, ".env.schema"),
    join(cwd, ".env.example"),
    join(cwd, ".env"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readSecretSchema(schemaPath: string | undefined): SchemaSecretInfo[] {
  if (!schemaPath) {
    return [];
  }

  const content = readFileSync(schemaPath, "utf-8");
  const keys: SchemaSecretInfo[] = [];
  const seen = new Set<string>();
  let inBootstrapSection = false;
  let nextIsRequired = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === BOOTSTRAP_SECTION_HEADER) {
      inBootstrapSection = true;
      nextIsRequired = false;
      continue;
    }

    if (line.startsWith("# ---- ") && line.endsWith(" ----")) {
      inBootstrapSection = false;
      nextIsRequired = false;
      continue;
    }

    if (inBootstrapSection) {
      continue;
    }

    if (line.startsWith("#")) {
      if (line.includes("@required")) {
        nextIsRequired = true;
      }
      continue;
    }

    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match) {
      nextIsRequired = false;
      continue;
    }

    const key = match[1];
    if (!key) {
      nextIsRequired = false;
      continue;
    }

    if (BOOTSTRAP_SECRET_NAMES.has(key) || CERTIFICATE_SECRET_NAMES.has(key)) {
      nextIsRequired = false;
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      keys.push({ key, required: nextIsRequired });
    }
    nextIsRequired = false;
  }

  return keys;
}

function readLocalEnvValues(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {};
  }

  // node:util parseEnv handles comments, blanks, single/double quotes,
  // and the `export ` prefix. We then filter to UPPER_SNAKE_CASE so
  // shell-style locals (e.g. `nodeEnv=...`) can't be pushed as secrets
  // via --all.
  const parsed = parseEnv(readFileSync(envPath, "utf-8"));
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(key)) {
      values[key] = value;
    }
  }
  return values;
}

function parseOnlyKeys(value?: string): string[] {
  if (!value) {
    return [];
  }

  const keys: string[] = [];
  const seen = new Set<string>();

  for (const rawKey of value.split(",")) {
    const key = rawKey.trim().toUpperCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function selectCandidateKeys(
  schemaKeys: string[],
  localEnvValues: Record<string, string>,
  includeAll: boolean,
  onlyKeys: string[],
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const pushKey = (key: string): void => {
    if (isPushableKey(key) && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };

  if (onlyKeys.length > 0) {
    for (const key of onlyKeys) {
      pushKey(key);
    }
    return keys;
  }

  for (const key of schemaKeys) {
    pushKey(key);
  }

  if (includeAll) {
    for (const key of Object.keys(localEnvValues)) {
      pushKey(key);
    }
  }

  return keys;
}

function isPushableKey(key: string): boolean {
  return !BOOTSTRAP_SECRET_NAMES.has(key) && !CERTIFICATE_SECRET_NAMES.has(key);
}

function splitMissingSecrets(
  skippedKeys: string[],
  schemaSecrets: Map<string, SchemaSecretInfo>,
): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];

  for (const key of skippedKeys) {
    const schemaSecret = schemaSecrets.get(key);
    if (schemaSecret?.required) {
      required.push(key);
      continue;
    }
    optional.push(key);
  }

  return { required, optional };
}

function logMissingSecrets(
  logger: (message: string) => void,
  skippedKeys: string[],
  schemaSecrets: Map<string, SchemaSecretInfo>,
): void {
  const missing = splitMissingSecrets(skippedKeys, schemaSecrets);
  logKeyGroup(logger, "Required before first deploy", missing.required);
  logKeyGroup(logger, "Safe to ignore for now", missing.optional);
}

function logKeyGroup(
  logger: (message: string) => void,
  header: string,
  keys: string[],
): void {
  if (keys.length === 0) return;
  logger(`${header} (${keys.length}):`);
  for (const key of keys) {
    logger(`  - ${key}`);
  }
}

function collectSecretValues(
  keys: string[],
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
): { pushedKeys: Array<[string, string]>; skippedKeys: string[] } {
  const pushedKeys: Array<[string, string]> = [];
  const skippedKeys: string[] = [];

  for (const key of keys) {
    const envValue = env[key];
    const localValue = localEnvValues[key];
    const value = envValue ?? localValue;

    if (value === undefined || value.trim().length === 0) {
      skippedKeys.push(key);
      continue;
    }

    pushedKeys.push([key, value]);
  }

  return { pushedKeys, skippedKeys };
}
