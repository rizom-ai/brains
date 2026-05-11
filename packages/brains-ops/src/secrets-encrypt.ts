import { readFileSync } from "node:fs";
import { access, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { Encrypter, armor } from "age-encryption";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "@brains/deploy-support";
import { toYaml, z } from "@brains/utils";

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
  const encryptedPath = join(rootDir, "users", `${handle}.secrets.yaml.age`);
  const plaintextPath = join(rootDir, "users", `${handle}.secrets.yaml`);
  const encryptedDisplayPath = normalizePath(relative(rootDir, encryptedPath));
  const plaintextDisplayPath = normalizePath(relative(rootDir, plaintextPath));
  const plaintextSecrets = readPlaintextUserSecrets(plaintextPath);
  const deletedPlaintext = await fileExists(plaintextPath);
  const secretResolutionOptions = {
    sharedAiApiKeySelector: registry.pilot.aiApiKey,
    sharedGitSyncTokenSelector: registry.pilot.gitSyncToken,
    sharedMcpAuthTokenSelector: registry.pilot.mcpAuthToken,
    effectiveAiApiKeySelector: user.effectiveAiApiKey,
    effectiveGitSyncTokenSelector: user.effectiveGitSyncToken,
    effectiveMcpAuthTokenSelector: user.effectiveMcpAuthToken,
    discordEnabled: user.discordEnabled,
  };

  let secrets: EncryptedUserSecrets;
  try {
    secrets = buildEncryptedUserSecrets(
      rootDir,
      env,
      localEnvValues,
      plaintextSecrets,
      secretResolutionOptions,
    );
  } catch (error) {
    if (
      !options.dryRun &&
      plaintextSecrets === undefined &&
      error instanceof Error
    ) {
      const templateKeys = listExpectedSecretKeys(secretResolutionOptions);
      if (templateKeys.length > 0) {
        await writePlaintextSecretsTemplate(plaintextPath, templateKeys);
        throw new Error(
          `Missing required secrets for ${handle}. Created ${plaintextDisplayPath}; fill it in and rerun secrets:encrypt. ${error.message}`,
        );
      }
    }
    throw error;
  }

  const plaintext = `${toYaml(secrets).trimEnd()}\n`;
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
  plaintextSecrets: Partial<EncryptedUserSecrets> | undefined,
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
    plaintextSecrets,
    "aiApiKey",
    options.effectiveAiApiKeySelector,
    options.sharedAiApiKeySelector,
  );
  const gitSyncToken = resolveOverrideSecretValue(
    rootDir,
    env,
    localEnvValues,
    plaintextSecrets,
    "gitSyncToken",
    options.effectiveGitSyncTokenSelector,
    options.sharedGitSyncTokenSelector,
  );
  const mcpAuthToken = resolveOverrideSecretValue(
    rootDir,
    env,
    localEnvValues,
    plaintextSecrets,
    "mcpAuthToken",
    options.effectiveMcpAuthTokenSelector,
    options.sharedMcpAuthTokenSelector,
  );
  const discordBotToken = options.discordEnabled
    ? resolveRequiredSecretValue(
        rootDir,
        env,
        localEnvValues,
        plaintextSecrets,
        "discordBotToken",
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
  plaintextSecrets: Partial<EncryptedUserSecrets> | undefined,
  plaintextKey: keyof EncryptedUserSecrets,
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
    plaintextSecrets,
    plaintextKey,
    effectiveSelector,
  );
}

function resolveRequiredSecretValue(
  rootDir: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  plaintextSecrets: Partial<EncryptedUserSecrets> | undefined,
  plaintextKey: keyof EncryptedUserSecrets,
  fallbackEnvKey: string,
): string {
  const value = resolveSecretValue(
    plaintextSecrets,
    plaintextKey,
    fallbackEnvKey,
    env,
    localEnvValues,
    rootDir,
  );
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `Missing required secret value for ${String(plaintextKey)}. Set it in users/<handle>.secrets.yaml or fall back to ${fallbackEnvKey}/${fallbackEnvKey}_FILE before running secrets:encrypt.`,
    );
  }

  return value;
}

function resolveSecretValue(
  plaintextSecrets: Partial<EncryptedUserSecrets> | undefined,
  plaintextKey: keyof EncryptedUserSecrets,
  fallbackEnvKey: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  cwd: string,
): string | undefined {
  const plaintextValue = plaintextSecrets?.[plaintextKey];
  if (plaintextValue !== undefined && plaintextValue.trim().length > 0) {
    return plaintextValue;
  }

  const filePath = resolveLocalEnvValue(
    `${fallbackEnvKey}_FILE`,
    env,
    localEnvValues,
  );
  if (filePath && filePath.trim().length > 0) {
    return readFileSync(resolveLocalPath(filePath, cwd), "utf8");
  }

  const value = resolveLocalEnvValue(fallbackEnvKey, env, localEnvValues);
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function readPlaintextUserSecrets(
  plaintextPath: string,
): Partial<EncryptedUserSecrets> | undefined {
  try {
    return encryptedUserSecretsSchema
      .partial()
      .parse(parseFlatYaml(readFileSync(plaintextPath, "utf8")));
  } catch {
    return undefined;
  }
}

function parseFlatYaml(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      continue;
    }

    result[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return result;
}

function listExpectedSecretKeys(options: {
  sharedAiApiKeySelector: string;
  sharedGitSyncTokenSelector: string;
  sharedMcpAuthTokenSelector: string;
  effectiveAiApiKeySelector: string;
  effectiveGitSyncTokenSelector: string;
  effectiveMcpAuthTokenSelector: string;
  discordEnabled: boolean;
}): Array<keyof EncryptedUserSecrets> {
  return [
    ...(options.effectiveAiApiKeySelector !== options.sharedAiApiKeySelector
      ? ["aiApiKey" as const]
      : []),
    ...(options.effectiveGitSyncTokenSelector !==
    options.sharedGitSyncTokenSelector
      ? ["gitSyncToken" as const]
      : []),
    ...(options.effectiveMcpAuthTokenSelector !==
    options.sharedMcpAuthTokenSelector
      ? ["mcpAuthToken" as const]
      : []),
    ...(options.discordEnabled ? ["discordBotToken" as const] : []),
  ];
}

async function writePlaintextSecretsTemplate(
  plaintextPath: string,
  keys: Array<keyof EncryptedUserSecrets>,
): Promise<void> {
  const template = [
    "# local per-user secret staging file",
    "# fill values, run `bunx brains-ops secrets:encrypt . <handle>`, then the plaintext file will be removed",
    ...keys.map((key) => `${key}: `),
    "",
  ].join("\n");
  await writeFile(plaintextPath, template, { flag: "wx" });
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
