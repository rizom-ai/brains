import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  normalizePushTarget,
  resolveOpToken,
  vaultNameForInstance,
  type PushTarget,
} from "../lib/push-target";
import { runSubprocess, type RunCommand } from "../lib/run-subprocess";

export interface SecretsPushOptions {
  env?: NodeJS.ProcessEnv | undefined;
  logger?: (message: string) => void;
  opToken?: string | undefined;
  pushTo?: string | undefined;
  runCommand?: RunCommand | undefined;
}

export interface SecretsPushResult {
  target: PushTarget;
  pushedKeys: string[];
  skippedKeys: string[];
  vaultName?: string | undefined;
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
      message: `Pushed ${result.pushedKeys.length} secrets to ${result.target}`,
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
  const runCommand = options.runCommand ?? runSubprocess;
  const env = options.env ?? process.env;

  const schemaPath = resolveSchemaPath(cwd);
  const localEnvValues = readLocalEnvValues(join(cwd, ".env"));
  const allowedKeys = readSecretKeys(schemaPath);
  const { pushedKeys, skippedKeys } = collectSecretValues(
    allowedKeys,
    env,
    localEnvValues,
  );

  if (pushedKeys.length === 0) {
    throw new Error(
      `No local secrets found in ${schemaPath ? basename(schemaPath) : ".env"}`,
    );
  }

  if (target === "gh") {
    logger(`Pushing ${pushedKeys.length} secrets to GitHub Secrets...`);
    await Promise.all(
      pushedKeys.map(([key, value]) =>
        runCommand("gh", ["secret", "set", key], { stdin: value }),
      ),
    );
    if (skippedKeys.length > 0) {
      logger(
        `Skipped ${skippedKeys.length} unset keys: ${skippedKeys.join(", ")}`,
      );
    }
    return {
      target,
      pushedKeys: pushedKeys.map(([key]) => key),
      skippedKeys,
    };
  }

  const opToken = resolveOpToken(env, options.opToken);
  if (!opToken) {
    throw new Error(
      "Missing OP_TOKEN (or OP_SERVICE_ACCOUNT_TOKEN) for 1Password push",
    );
  }

  const vaultName = vaultNameForInstance(cwd);
  const tempDir = mkdtempSync(join(tmpdir(), "brain-secrets-push-"));
  const opEnv = { OP_SERVICE_ACCOUNT_TOKEN: opToken };

  try {
    logger(
      `Pushing ${pushedKeys.length} secrets to 1Password vault ${vaultName}...`,
    );
    await Promise.all(
      pushedKeys.map(([key, value]) => {
        const filePath = join(tempDir, key);
        writeFileSync(filePath, value, { encoding: "utf-8", mode: 0o600 });
        return runCommand(
          "op",
          [
            "document",
            "create",
            filePath,
            "--vault",
            vaultName,
            "--title",
            key,
          ],
          { env: opEnv },
        );
      }),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  if (skippedKeys.length > 0) {
    logger(
      `Skipped ${skippedKeys.length} unset keys: ${skippedKeys.join(", ")}`,
    );
  }

  return {
    target,
    vaultName,
    pushedKeys: pushedKeys.map(([key]) => key),
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

    if (line === "# ---- secret backend bootstrap ----") {
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
