import { readFileSync } from "node:fs";

import {
  parseEnvSchemaFile,
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
  type EnvSchemaEntry,
} from "@brains/deploy-support";

import { pushSecretsToBackend } from "./push-secrets";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export interface SecretsPushOptions {
  env?: NodeJS.ProcessEnv | undefined;
  logger?: ((message: string) => void) | undefined;
  dryRun?: boolean | undefined;
  runCommand?: RunCommand | undefined;
}

export interface SecretsPushResult {
  pushedKeys: string[];
  skippedKeys: string[];
  dryRun?: boolean | undefined;
}

interface SecretTarget {
  key: string;
  required: boolean;
}

export async function pushPilotSecrets(
  rootDir: string,
  options: SecretsPushOptions = {},
): Promise<SecretsPushResult> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console.log;
  const localEnvValues = readLocalEnvValues(rootDir);
  const schemaEntries = parseEnvSchemaFile(`${rootDir}/.env.schema`);
  const targets = buildSecretTargets(schemaEntries);

  const pushedKeys: Array<[string, string]> = [];
  const skippedKeys: string[] = [];
  const requiredSecrets = new Map<string, boolean>();

  for (const target of targets) {
    requiredSecrets.set(target.key, target.required);
    const value = resolveSecretValue(target.key, env, localEnvValues, rootDir);
    if (value === undefined || value.trim().length === 0) {
      skippedKeys.push(target.key);
      continue;
    }
    pushedKeys.push([target.key, value]);
  }

  if (pushedKeys.length === 0) {
    throw new Error("No pushable local secrets found for this pilot repo");
  }

  if (options.dryRun) {
    logger(
      `Dry run: would push ${pushedKeys.length} secrets to GitHub Secrets.`,
    );
    logger(`Secrets: ${pushedKeys.map(([key]) => key).join(", ")}`);
    logMissingSecrets(logger, skippedKeys, requiredSecrets);
    return {
      pushedKeys: pushedKeys.map(([key]) => key),
      skippedKeys,
      dryRun: true,
    };
  }

  await pushSecretsToBackend("gh", pushedKeys, {
    logger,
    runCommand: options.runCommand ?? runSubprocess,
  });
  logMissingSecrets(logger, skippedKeys, requiredSecrets);

  return {
    pushedKeys: pushedKeys.map(([key]) => key),
    skippedKeys,
  };
}

function buildSecretTargets(schemaEntries: EnvSchemaEntry[]): SecretTarget[] {
  return schemaEntries
    .filter((entry) => entry.key !== "DISCORD_BOT_TOKEN")
    .map((entry) => ({
      key: entry.key,
      required: entry.required,
    }));
}

function resolveSecretValue(
  key: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  cwd: string,
): string | undefined {
  const filePath = resolveLocalEnvValue(`${key}_FILE`, env, localEnvValues);
  if (filePath && filePath.trim().length > 0) {
    return readFileSync(resolveLocalPath(filePath, cwd), "utf8");
  }

  const value = resolveLocalEnvValue(key, env, localEnvValues);
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function logMissingSecrets(
  logger: (message: string) => void,
  skippedKeys: string[],
  requiredSecrets: Map<string, boolean>,
): void {
  const required = skippedKeys.filter((key) => requiredSecrets.get(key));
  const optional = skippedKeys.filter((key) => !requiredSecrets.get(key));

  logKeyGroup(logger, "Required before first deploy", required);
  logKeyGroup(logger, "Safe to ignore for now", optional);
}

function logKeyGroup(
  logger: (message: string) => void,
  header: string,
  keys: string[],
): void {
  if (keys.length === 0) {
    return;
  }

  logger(`${header} (${keys.length}):`);
  for (const key of keys) {
    logger(`  - ${key}`);
  }
}
