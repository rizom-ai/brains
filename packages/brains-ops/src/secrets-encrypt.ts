import { readFileSync } from "node:fs";
import { access, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { Encrypter, armor } from "age-encryption";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
  toYaml,
  z,
} from "@brains/utils";

import { findUser } from "./reconcile-lib";

const encryptedUserSecretsSchema = z
  .object({
    gitSyncToken: z.string().min(1).optional(),
    mcpAuthToken: z.string().min(1).optional(),
    discordBotToken: z.string().min(1).optional(),
    aiApiKey: z.string().min(1).optional(),
  })
  .strict();

export type EncryptedUserSecrets = z.infer<typeof encryptedUserSecretsSchema>;

export interface SecretsEncryptOptions {
  env?: NodeJS.ProcessEnv | undefined;
  logger?: ((message: string) => void) | undefined;
  dryRun?: boolean | undefined;
}

export interface SecretsEncryptResult {
  encryptedPath: string;
  plaintextPath: string;
  deletedPlaintext: boolean;
  encryptedKeys: Array<keyof EncryptedUserSecrets>;
  dryRun?: boolean | undefined;
}

export async function encryptPilotSecrets(
  rootDir: string,
  handle: string,
  options: SecretsEncryptOptions = {},
): Promise<SecretsEncryptResult> {
  const { registry, user } = await findUser(rootDir, handle);
  const env = options.env ?? process.env;
  const logger = options.logger ?? console.log;
  const localEnvValues = readLocalEnvValues(rootDir);

  const secrets = buildEncryptedUserSecrets(rootDir, env, localEnvValues, {
    sharedAiApiKeySelector: registry.pilot.aiApiKey,
    sharedGitSyncTokenSelector: registry.pilot.gitSyncToken,
    sharedMcpAuthTokenSelector: registry.pilot.mcpAuthToken,
    effectiveAiApiKeySelector: user.effectiveAiApiKey,
    effectiveGitSyncTokenSelector: user.effectiveGitSyncToken,
    effectiveMcpAuthTokenSelector: user.effectiveMcpAuthToken,
    discordEnabled: user.discordEnabled,
  });

  const plaintext = `${toYaml(secrets).trimEnd()}\n`;
  const encryptedPath = join(rootDir, "users", `${handle}.secrets.yaml.age`);
  const plaintextPath = join(rootDir, "users", `${handle}.secrets.yaml`);
  const encryptedDisplayPath = normalizePath(relative(rootDir, encryptedPath));
  const plaintextDisplayPath = normalizePath(relative(rootDir, plaintextPath));
  const deletedPlaintext = await fileExists(plaintextPath);
  const encryptedKeys = Object.keys(secrets) as Array<
    keyof EncryptedUserSecrets
  >;

  if (options.dryRun) {
    logger(
      `Dry run: would encrypt ${encryptedKeys.length} secrets to ${encryptedDisplayPath}.`,
    );
    logger(
      encryptedKeys.length > 0
        ? `Keys: ${encryptedKeys.join(", ")}`
        : "Keys: (none — shared defaults only)",
    );
    if (deletedPlaintext) {
      logger(`Would remove plaintext file ${plaintextDisplayPath}.`);
    }
    return {
      encryptedPath: encryptedDisplayPath,
      plaintextPath: plaintextDisplayPath,
      deletedPlaintext,
      encryptedKeys,
      dryRun: true,
    };
  }

  const encrypter = new Encrypter();
  encrypter.addRecipient(registry.pilot.agePublicKey);
  const ciphertext = await encrypter.encrypt(plaintext);
  const armored = armor.encode(ciphertext);

  await writeFile(encryptedPath, armored);
  await rm(plaintextPath, { force: true });

  logger(
    `Encrypted ${encryptedKeys.length} secrets to ${encryptedDisplayPath}.`,
  );
  if (deletedPlaintext) {
    logger(`Removed plaintext file ${plaintextDisplayPath}.`);
  }

  return {
    encryptedPath: encryptedDisplayPath,
    plaintextPath: plaintextDisplayPath,
    deletedPlaintext,
    encryptedKeys,
  };
}

function buildEncryptedUserSecrets(
  rootDir: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  options: {
    sharedAiApiKeySelector: string;
    sharedGitSyncTokenSelector: string;
    sharedMcpAuthTokenSelector: string;
    effectiveAiApiKeySelector: string;
    effectiveGitSyncTokenSelector: string;
    effectiveMcpAuthTokenSelector: string;
    discordEnabled: boolean;
  },
): EncryptedUserSecrets {
  const aiApiKey = resolveOverrideSecretValue(
    rootDir,
    env,
    localEnvValues,
    options.effectiveAiApiKeySelector,
    options.sharedAiApiKeySelector,
  );
  const gitSyncToken = resolveOverrideSecretValue(
    rootDir,
    env,
    localEnvValues,
    options.effectiveGitSyncTokenSelector,
    options.sharedGitSyncTokenSelector,
  );
  const mcpAuthToken = resolveOverrideSecretValue(
    rootDir,
    env,
    localEnvValues,
    options.effectiveMcpAuthTokenSelector,
    options.sharedMcpAuthTokenSelector,
  );
  const discordBotToken = options.discordEnabled
    ? resolveRequiredSecretValue(
        rootDir,
        env,
        localEnvValues,
        "DISCORD_BOT_TOKEN",
      )
    : undefined;

  return encryptedUserSecretsSchema.parse({
    ...(aiApiKey ? { aiApiKey } : {}),
    ...(gitSyncToken ? { gitSyncToken } : {}),
    ...(mcpAuthToken ? { mcpAuthToken } : {}),
    ...(discordBotToken ? { discordBotToken } : {}),
  });
}

function resolveOverrideSecretValue(
  rootDir: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  effectiveSelector: string,
  sharedSelector: string,
): string | undefined {
  if (effectiveSelector === sharedSelector) {
    return undefined;
  }

  return resolveRequiredSecretValue(
    rootDir,
    env,
    localEnvValues,
    effectiveSelector,
  );
}

function resolveRequiredSecretValue(
  rootDir: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  key: string,
): string {
  const value = resolveSecretValue(key, env, localEnvValues, rootDir);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `Missing required local secret value for ${key}. Set ${key} or ${key}_FILE before running secrets:encrypt.`,
    );
  }

  return value;
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
