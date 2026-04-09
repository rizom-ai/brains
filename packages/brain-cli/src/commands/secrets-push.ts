import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
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
  const allowedKeys = readSecretKeys(schemaPath);
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
    if (skippedKeys.length > 0) {
      logger(
        `Skipped ${skippedKeys.length} unset keys: ${skippedKeys.join(", ")}`,
      );
    }

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

  if (skippedKeys.length > 0) {
    logger(
      `Skipped ${skippedKeys.length} unset keys: ${skippedKeys.join(", ")}`,
    );
  }

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

function readSecretKeys(schemaPath: string | undefined): string[] {
  if (!schemaPath) {
    return [];
  }

  const content = readFileSync(schemaPath, "utf-8");
  const keys: string[] = [];
  const seen = new Set<string>();
  let inBootstrapSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === BOOTSTRAP_SECTION_HEADER) {
      inBootstrapSection = true;
      continue;
    }

    if (line.startsWith("# ---- ") && line.endsWith(" ----")) {
      inBootstrapSection = false;
      continue;
    }

    if (inBootstrapSection) {
      continue;
    }

    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (!key) {
      continue;
    }

    if (BOOTSTRAP_SECRET_NAMES.has(key) || CERTIFICATE_SECRET_NAMES.has(key)) {
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}

function readLocalEnvValues(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, "utf-8");
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const exportedLine = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const equalsIndex = exportedLine.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = exportedLine.slice(0, equalsIndex).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      continue;
    }

    let value = exportedLine.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
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
