import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "@brains/deploy-support";
import { parseJsonResponse, z } from "@brains/utils";
import { type FetchLike } from "@brains/deploy-support/origin-ca";
import { pushSecretsToBackend, normalizePushTarget } from "./push-secrets";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export interface SshKeyBootstrapOptions {
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: FetchLike | undefined;
  logger?: (message: string) => void;
  pushTo?: string | undefined;
  runCommand?: RunCommand | undefined;
  sshKeygen?: SshKeygen | undefined;
}

export interface SshKeyBootstrapResult {
  createdHetznerKey: boolean;
  createdLocalKey: boolean;
  privateKeyPath: string;
  publicKeyPath: string;
  sshKeyName: string;
}

export interface SshKeygen {
  createEd25519KeyPair: (privateKeyPath: string, comment: string) => void;
  derivePublicKey: (privateKeyPath: string) => string;
}

const hetznerSshKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  public_key: z.string(),
});

const hetznerSshKeysResponseSchema = z.object({
  ssh_keys: z.array(hetznerSshKeySchema),
});

const defaultSshKeygen: SshKeygen = {
  createEd25519KeyPair(privateKeyPath, comment) {
    execFileSync(
      "ssh-keygen",
      ["-t", "ed25519", "-f", privateKeyPath, "-C", comment, "-N", ""],
      { stdio: "ignore" },
    );
  },
  derivePublicKey(privateKeyPath) {
    return execFileSync("ssh-keygen", ["-y", "-f", privateKeyPath], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "inherit"],
    }).trim();
  },
};

export async function runPilotSshKeyBootstrap(
  rootDir: string,
  options: SshKeyBootstrapOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await bootstrapPilotSshKey(rootDir, options);
    return {
      success: true,
      message: result.createdLocalKey
        ? `SSH deploy key ready at ${result.privateKeyPath}`
        : `SSH deploy key already ready at ${result.privateKeyPath}`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "SSH key bootstrap failed",
    };
  }
}

export async function bootstrapPilotSshKey(
  rootDir: string,
  options: SshKeyBootstrapOptions = {},
): Promise<SshKeyBootstrapResult> {
  const env = options.env ?? process.env;
  const localEnvValues = readLocalEnvValues(rootDir);
  const logger = options.logger ?? console.log;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sshKeygen = options.sshKeygen ?? defaultSshKeygen;

  const hcloudToken = resolveLocalEnvValue("HCLOUD_TOKEN", env, localEnvValues);
  if (!hcloudToken) {
    throw new Error("Missing HCLOUD_TOKEN");
  }

  const sshKeyName = resolveLocalEnvValue(
    "HCLOUD_SSH_KEY_NAME",
    env,
    localEnvValues,
  );
  if (!sshKeyName) {
    throw new Error("Missing HCLOUD_SSH_KEY_NAME");
  }

  const configuredKeyPath = resolveLocalEnvValue(
    "KAMAL_SSH_PRIVATE_KEY_FILE",
    env,
    localEnvValues,
  );
  const privateKeyPath = configuredKeyPath
    ? resolveLocalPath(configuredKeyPath, rootDir)
    : join(homedir(), ".ssh", `${sanitizeSshKeyName(sshKeyName)}_ed25519`);
  const publicKeyPath = `${privateKeyPath}.pub`;

  let createdLocalKey = false;
  if (!existsSync(privateKeyPath)) {
    mkdirSync(dirname(privateKeyPath), { recursive: true, mode: 0o700 });
    sshKeygen.createEd25519KeyPair(privateKeyPath, sshKeyName);
    createdLocalKey = true;
  }
  chmodSync(privateKeyPath, 0o600);

  let publicKey: string;
  if (createdLocalKey) {
    publicKey = readFileSync(publicKeyPath, "utf-8").trim();
  } else {
    publicKey = sshKeygen.derivePublicKey(privateKeyPath);
    writeFileSync(publicKeyPath, `${publicKey}\n`, "utf-8");
  }

  if (publicKey.length === 0) {
    throw new Error(`Unable to derive a public key from ${privateKeyPath}`);
  }

  const createdHetznerKey = await ensureHetznerSshKey({
    fetchImpl,
    hcloudToken,
    publicKey,
    sshKeyName,
  });

  const pushTarget = normalizePushTarget(options.pushTo);
  if (pushTarget) {
    await pushSecretsToBackend(
      pushTarget,
      [["KAMAL_SSH_PRIVATE_KEY", readFileSync(privateKeyPath, "utf-8")]],
      {
        logger,
        runCommand: options.runCommand ?? runSubprocess,
      },
    );
  }

  logger(
    createdLocalKey ? `Created ${privateKeyPath}` : `Reusing ${privateKeyPath}`,
  );
  logger(
    createdHetznerKey
      ? `Registered Hetzner SSH key ${sshKeyName}`
      : `Hetzner SSH key ${sshKeyName} already exists`,
  );
  if (pushTarget) {
    logger(`Pushed KAMAL_SSH_PRIVATE_KEY to ${pushTarget}`);
  }

  return {
    createdHetznerKey,
    createdLocalKey,
    privateKeyPath,
    publicKeyPath,
    sshKeyName,
  };
}

async function ensureHetznerSshKey(options: {
  fetchImpl: FetchLike;
  hcloudToken: string;
  publicKey: string;
  sshKeyName: string;
}): Promise<boolean> {
  const listUrl = new URL("https://api.hetzner.cloud/v1/ssh_keys");
  listUrl.searchParams.set("name", options.sshKeyName);

  const listResponse = await options.fetchImpl(listUrl.toString(), {
    headers: {
      Authorization: `Bearer ${options.hcloudToken}`,
      "Content-Type": "application/json",
    },
  });
  const { ssh_keys } = await parseJsonResponse(
    listResponse,
    hetznerSshKeysResponseSchema,
    { label: "Hetzner SSH key lookup failed" },
  );
  const [existingKey] = ssh_keys;

  if (existingKey) {
    if (existingKey.public_key.trim() !== options.publicKey) {
      throw new Error(
        `Existing Hetzner SSH key ${options.sshKeyName} does not match the local public key`,
      );
    }
    return false;
  }

  const createResponse = await options.fetchImpl(
    "https://api.hetzner.cloud/v1/ssh_keys",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.hcloudToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: options.sshKeyName,
        public_key: options.publicKey,
      }),
    },
  );
  await parseJsonResponse(
    createResponse,
    z.object({ ssh_key: hetznerSshKeySchema }),
    {
      label: "Hetzner SSH key create failed",
    },
  );

  return true;
}

function sanitizeSshKeyName(sshKeyName: string): string {
  return sshKeyName.replace(/[^A-Za-z0-9._-]+/g, "_");
}
