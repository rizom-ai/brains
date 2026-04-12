import { readFileSync } from "node:fs";
import { parseEnvSchemaFile, type EnvSchemaEntry } from "@brains/utils";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "@brains/utils";
import { findUser } from "./reconcile-lib";
import { deriveUserSecretNames } from "./user-secret-names";

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

export type RunCommand = (
  command: string,
  args: string[],
  options?: { stdin?: string; env?: NodeJS.ProcessEnv },
) => Promise<void>;

interface SecretTarget {
  destination: string;
  sourceKeys: string[];
  required: boolean;
}

export async function pushPilotSecrets(
  rootDir: string,
  handle: string,
  options: SecretsPushOptions = {},
): Promise<SecretsPushResult> {
  const { user } = await findUser(rootDir, handle);
  const env = options.env ?? process.env;
  const logger = options.logger ?? console.log;
  const localEnvValues = readLocalEnvValues(rootDir);
  const schemaEntries = parseEnvSchemaFile(`${rootDir}/.env.schema`);
  const targets = buildSecretTargets(schemaEntries, user);

  const pushedKeys: Array<[string, string]> = [];
  const skippedKeys: string[] = [];
  const requiredSecrets = new Map<string, boolean>();

  for (const target of targets) {
    requiredSecrets.set(target.destination, target.required);
    const value = resolveSecretValue(target, env, localEnvValues, rootDir);
    if (value === undefined || value.trim().length === 0) {
      skippedKeys.push(target.destination);
      continue;
    }
    pushedKeys.push([target.destination, value]);
  }

  if (pushedKeys.length === 0) {
    throw new Error(
      "No pushable local secrets found for the selected pilot user",
    );
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

  const runCommand = options.runCommand ?? runSubprocess;
  logger(`Pushing ${pushedKeys.length} secrets to GitHub Secrets...`);
  await Promise.all(
    pushedKeys.map(([key, value]) =>
      runCommand("gh", ["secret", "set", key], { stdin: value }),
    ),
  );
  logMissingSecrets(logger, skippedKeys, requiredSecrets);

  return {
    pushedKeys: pushedKeys.map(([key]) => key),
    skippedKeys,
  };
}

function buildSecretTargets(
  schemaEntries: EnvSchemaEntry[],
  user: Awaited<ReturnType<typeof findUser>>["user"],
): SecretTarget[] {
  const userSecretNames = deriveUserSecretNames(user.handle);

  return schemaEntries.flatMap((entry) => {
    switch (entry.key) {
      case "AI_API_KEY":
        return [
          {
            destination: user.effectiveAiApiKey,
            sourceKeys: [user.effectiveAiApiKey, "AI_API_KEY"],
            required: entry.required,
          },
        ];
      case "GIT_SYNC_TOKEN":
        return [
          {
            destination: userSecretNames.gitSyncTokenSecretName,
            sourceKeys: [
              userSecretNames.gitSyncTokenSecretName,
              "GIT_SYNC_TOKEN",
            ],
            required: entry.required,
          },
        ];
      case "MCP_AUTH_TOKEN":
        return [
          {
            destination: userSecretNames.mcpAuthTokenSecretName,
            sourceKeys: [
              userSecretNames.mcpAuthTokenSecretName,
              "MCP_AUTH_TOKEN",
            ],
            required: entry.required,
          },
        ];
      case "DISCORD_BOT_TOKEN":
        if (!user.discordEnabled) {
          return [];
        }
        return [
          {
            destination: userSecretNames.discordBotTokenSecretName,
            sourceKeys: [
              userSecretNames.discordBotTokenSecretName,
              "DISCORD_BOT_TOKEN",
            ],
            required: entry.required,
          },
        ];
      default:
        return [
          {
            destination: entry.key,
            sourceKeys: [entry.key],
            required: entry.required,
          },
        ];
    }
  });
}

function resolveSecretValue(
  target: SecretTarget,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  cwd: string,
): string | undefined {
  const candidates = [target.destination, ...target.sourceKeys];

  for (const key of candidates) {
    const filePath = resolveLocalEnvValue(`${key}_FILE`, env, localEnvValues);
    if (filePath && filePath.trim().length > 0) {
      return readFileSync(resolveLocalPath(filePath, cwd), "utf8");
    }
  }

  for (const key of candidates) {
    const value = resolveLocalEnvValue(key, env, localEnvValues);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
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

const runSubprocess: RunCommand = async (command, args, options = {}) => {
  const { spawn } = await import("node:child_process");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["pipe", "inherit", "inherit"],
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`),
      );
    });

    if (options.stdin) {
      proc.stdin.end(options.stdin);
      return;
    }

    proc.stdin.end();
  });
};
