import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { parseEnvSchemaFile, type EnvSchemaEntry } from "@brains/utils";
import { BOOTSTRAP_SECTION_HEADER } from "../lib/env-schema";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "../lib/local-env";
import { pushSecretsToBackend } from "../lib/push-secrets";
import { normalizePushTarget, type PushTarget } from "../lib/push-target";
import { type RunCommand } from "../lib/run-subprocess";

export interface SecretsPushOptions {
  env?: NodeJS.ProcessEnv | undefined;
  logger?: (message: string) => void;
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
  dryRun?: boolean | undefined;
}

// Cert PEMs are stored separately by `brain cert:bootstrap`, never via
// secrets push. Filter them out so a stray entry in .env can't end up
// pushed twice with stale content.
const CERTIFICATE_SECRET_NAMES = new Set([
  "CERTIFICATE_PEM",
  "PRIVATE_KEY_PEM",
]);

export async function runSecretsPush(
  cwd: string,
  options: SecretsPushOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await pushSecrets(cwd, options);
    return {
      success: true,
      message: result.dryRun
        ? `Dry run: would push ${result.pushedKeys.length} env-backed secrets to ${result.target}`
        : `Pushed ${result.pushedKeys.length} env-backed secrets to ${result.target}`,
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
    throw new Error("Missing --push-to value. Use --push-to gh");
  }
  const logger = options.logger ?? console.log;
  const env = options.env ?? process.env;

  const schemaPath = resolveSchemaPath(cwd);
  const localEnvValues = readLocalEnvValues(cwd);
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
    cwd,
  );

  if (pushedKeys.length === 0) {
    throw new Error(
      `No local secrets found in ${schemaPath ? basename(schemaPath) : ".env"}`,
    );
  }

  const pushedSecretNames = pushedKeys.map(([key]) => key);

  if (options.dryRun) {
    logger(
      `Dry run: would push ${pushedSecretNames.length} secrets to GitHub Secrets.`,
    );
    if (pushedSecretNames.length > 0) {
      logger(`Secrets: ${pushedSecretNames.join(", ")}`);
    }
    logMissingSecrets(logger, skippedKeys, schemaSecretInfo);

    return {
      target,
      pushedKeys: pushedSecretNames,
      skippedKeys,
      dryRun: true,
    };
  }

  await pushSecretsToBackend(target, pushedKeys, {
    cwd,
    runCommand: options.runCommand,
    logger,
  });

  logMissingSecrets(logger, skippedKeys, schemaSecretInfo);

  return {
    target,
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

function readSecretSchema(schemaPath: string | undefined): EnvSchemaEntry[] {
  if (!schemaPath) {
    return [];
  }

  return parseEnvSchemaFile(schemaPath, {
    skipSections: new Set([BOOTSTRAP_SECTION_HEADER]),
  }).filter((entry) => !CERTIFICATE_SECRET_NAMES.has(entry.key));
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
  return !CERTIFICATE_SECRET_NAMES.has(key);
}

function splitMissingSecrets(
  skippedKeys: string[],
  schemaSecrets: Map<string, EnvSchemaEntry>,
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
  schemaSecrets: Map<string, EnvSchemaEntry>,
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
  cwd: string,
): { pushedKeys: Array<[string, string]>; skippedKeys: string[] } {
  const pushedKeys: Array<[string, string]> = [];
  const skippedKeys: string[] = [];

  for (const key of keys) {
    const fileKey = `${key}_FILE`;
    const filePath = resolveLocalEnvValue(fileKey, env, localEnvValues);
    const value =
      resolveSecretFileValue(filePath, cwd) ??
      resolveLocalEnvValue(key, env, localEnvValues);

    if (value === undefined || value.trim().length === 0) {
      skippedKeys.push(key);
      continue;
    }

    pushedKeys.push([key, value]);
  }

  return { pushedKeys, skippedKeys };
}

function resolveSecretFileValue(
  filePath: string | undefined,
  cwd: string,
): string | undefined {
  if (!filePath || filePath.trim().length === 0) {
    return undefined;
  }

  return readFileSync(resolveLocalPath(filePath, cwd), "utf-8");
}
