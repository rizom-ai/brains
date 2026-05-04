import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { parseEnvSchemaFile, type EnvSchemaEntry } from "@brains/utils";
import {
  BITWARDEN_BOOTSTRAP_TOKEN_NAMES,
  BOOTSTRAP_SECTION_HEADER,
  hasBitwardenPlugin,
} from "../lib/env-schema";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "../lib/local-env";
import {
  BitwardenSecretsManagerClient,
  inferBitwardenProjectName,
  type BitwardenPushResult,
  type BitwardenSecretsClient,
} from "../lib/bitwarden-secrets";
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
  bitwardenClient?: BitwardenSecretsClient | undefined;
}

export interface SecretsPushResult {
  target: PushTarget;
  pushedKeys: string[];
  skippedKeys: string[];
  dryRun?: boolean | undefined;
  bitwarden?: BitwardenPushResult | undefined;
}

// Cert PEMs are stored separately by `brain cert:bootstrap` for GitHub
// secrets. Bitwarden is the source-of-truth backend, so Bitwarden pushes keep
// them when present in the schema/local env.
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
    throw new Error("Missing --push-to value. Use --push-to gh or bitwarden");
  }
  const logger = options.logger ?? console.log;
  const env = options.env ?? process.env;

  const schemaPath = resolveSchemaPath(cwd);
  const localEnvValues = readLocalEnvValues(cwd);
  const schemaSecrets = readSecretSchema(schemaPath, target);
  const allowedKeys = schemaSecrets.map((secret) => secret.key);
  const schemaSecretInfo = new Map(
    schemaSecrets.map((secret) => [secret.key, secret]),
  );
  const candidateKeys = selectCandidateKeys(
    allowedKeys,
    localEnvValues,
    options.all ?? false,
    parseOnlyKeys(options.only),
    target,
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
    if (target === "bitwarden") {
      const projectName = inferBitwardenProjectName(cwd);
      logger(
        `Dry run: would push ${pushedSecretNames.length} secrets to Bitwarden project ${projectName}.`,
      );
      logger(
        "Dry run: would update .env.schema with Bitwarden UUID references after push.",
      );
    } else {
      logger(
        `Dry run: would push ${pushedSecretNames.length} secrets to GitHub Secrets.`,
      );
    }
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

  if (target === "bitwarden") {
    if (!schemaPath || basename(schemaPath) !== ".env.schema") {
      throw new Error("Bitwarden secret push requires a .env.schema file");
    }

    const projectName = inferBitwardenProjectName(cwd);
    const bitwardenClient =
      options.bitwardenClient ?? new BitwardenSecretsManagerClient();
    const bitwarden = await bitwardenClient.pushSecrets(
      projectName,
      pushedKeys,
    );
    updateSchemaWithBitwardenMappings(schemaPath, bitwarden.mappings);
    logBitwardenPush(logger, bitwarden);
    logMissingSecrets(logger, skippedKeys, schemaSecretInfo);

    return {
      target,
      pushedKeys: pushedSecretNames,
      skippedKeys,
      bitwarden,
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

function readSecretSchema(
  schemaPath: string | undefined,
  target: PushTarget,
): EnvSchemaEntry[] {
  if (!schemaPath) {
    return [];
  }

  return parseEnvSchemaFile(schemaPath, {
    skipSections: new Set([BOOTSTRAP_SECTION_HEADER]),
  }).filter((entry) => isPushableKey(entry.key, target));
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
  target: PushTarget,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const pushKey = (key: string): void => {
    if (isPushableKey(key, target) && !seen.has(key)) {
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

function isPushableKey(key: string, target: PushTarget): boolean {
  if (BITWARDEN_BOOTSTRAP_TOKEN_NAMES.has(key)) {
    return false;
  }

  if (target === "gh" && CERTIFICATE_SECRET_NAMES.has(key)) {
    return false;
  }

  return true;
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

function logBitwardenPush(
  logger: (message: string) => void,
  result: BitwardenPushResult,
): void {
  logger(
    `${result.createdProject ? "Created" : "Using"} Bitwarden project ${result.projectName} (${result.projectId})`,
  );
  logKeyGroup(logger, "Created Bitwarden secrets", result.createdKeys);
  logKeyGroup(logger, "Updated Bitwarden secrets", result.updatedKeys);
  logger("Updated .env.schema with Bitwarden UUID references.");
  if (result.mappings.length > 0) {
    logger("Bitwarden schema references:");
    for (const mapping of result.mappings) {
      logger(`${mapping.key}=bitwarden("${mapping.id}")`);
    }
  }
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

function updateSchemaWithBitwardenMappings(
  schemaPath: string,
  mappings: readonly { key: string; id: string }[],
): void {
  let content = readFileSync(schemaPath, "utf-8");
  content = ensureBitwardenRootDecorators(content);

  for (const mapping of mappings) {
    const assignmentPattern = new RegExp(
      `^(${escapeRegExp(mapping.key)}\\s*=).*$`,
      "m",
    );
    if (!assignmentPattern.test(content)) {
      throw new Error(`Could not find ${mapping.key} in .env.schema`);
    }
    content = content.replace(
      assignmentPattern,
      `$1bitwarden("${mapping.id}")`,
    );
  }

  writeFileSync(schemaPath, content);
}

function ensureBitwardenRootDecorators(content: string): string {
  const decorators: string[] = [];
  if (!hasBitwardenPlugin(content)) {
    decorators.push("# @plugin(@varlock/bitwarden-plugin@1.0.0)");
  }
  if (!content.includes("@initBitwarden(")) {
    decorators.push("# @initBitwarden(accessToken=$BWS_ACCESS_TOKEN)");
  }

  const needsBootstrapToken = !/^BWS_ACCESS_TOKEN\s*=.*$/m.test(content);
  if (decorators.length === 0 && !needsBootstrapToken) {
    return content;
  }

  const lines = content.split("\n");
  const separatorIndex = lines.findIndex((line) => /^#\s*-{3,}\s*$/.test(line));
  const decoratorInsertIndex = separatorIndex >= 0 ? separatorIndex : 0;
  if (decorators.length > 0) {
    lines.splice(decoratorInsertIndex, 0, ...decorators);
  }

  if (needsBootstrapToken) {
    const separatorIndexAfterDecorators = lines.findIndex((line) =>
      /^#\s*-{3,}\s*$/.test(line),
    );
    const tokenLines = [
      "",
      "# Bitwarden bootstrap token supplied by shell/CI",
      "# @required @sensitive @type=bitwardenAccessToken",
      "BWS_ACCESS_TOKEN=",
    ];
    const tokenInsertIndex =
      separatorIndexAfterDecorators >= 0
        ? separatorIndexAfterDecorators + 1
        : decoratorInsertIndex + decorators.length;
    lines.splice(tokenInsertIndex, 0, ...tokenLines);
  }

  return lines.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
