import { readFileSync } from "node:fs";

import {
  parseEnvSchemaFile,
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
  type EnvSchemaEntry,
} from "@brains/deploy-support";

import { logMissingSecrets, pushSecretsToBackend } from "./push-secrets";
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

  const isRequired = (key: string): boolean =>
    requiredSecrets.get(key) ?? false;

  if (options.dryRun) {
    logger(
      `Dry run: would push ${pushedKeys.length} secrets to GitHub Secrets.`,
    );
    logger(`Secrets: ${pushedKeys.map(([key]) => key).join(", ")}`);
    logMissingSecrets(logger, skippedKeys, isRequired);
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
  logMissingSecrets(logger, skippedKeys, isRequired);

  return {
    pushedKeys: pushedKeys.map(([key]) => key),
    skippedKeys,
  };
}

const perUserDiscordEnvKeys = new Set([
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_APPLICATION_ID",
]);

function buildSecretTargets(schemaEntries: EnvSchemaEntry[]): SecretTarget[] {
  return schemaEntries
    .filter((entry) => !perUserDiscordEnvKeys.has(entry.key))
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
