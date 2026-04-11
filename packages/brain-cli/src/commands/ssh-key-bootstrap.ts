import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { z } from "@brains/utils";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "../lib/local-env";
import { pushSecretsToBackend } from "../lib/push-secrets";
import { normalizePushTarget } from "../lib/push-target";
import { runSubprocess, type RunCommand } from "../lib/run-subprocess";
import { type FetchLike } from "../lib/origin-ca";

export interface SshKeyBootstrapOptions {
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: FetchLike | undefined;
  hcloudToken?: string | undefined;
  logger?: (message: string) => void;
  privateKeyPath?: string | undefined;
  pushTo?: string | undefined;
  runCommand?: RunCommand | undefined;
  sshKeyName?: string | undefined;
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

const sshKeyBootstrapEnvSchema = z
  .object({
    HCLOUD_TOKEN: z.string().min(1).optional(),
    HCLOUD_SSH_KEY_NAME: z.string().min(1).optional(),
    KAMAL_SSH_PRIVATE_KEY_FILE: z.string().min(1).optional(),
  })
  .passthrough();

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

export async function runSshKeyBootstrap(
  cwd: string,
  options: SshKeyBootstrapOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await bootstrapSshKey(cwd, options);
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

export async function bootstrapSshKey(
  cwd: string,
  options: SshKeyBootstrapOptions = {},
): Promise<SshKeyBootstrapResult> {
  const env = options.env ?? process.env;
  const parsedEnv = sshKeyBootstrapEnvSchema.parse(env);
  const localEnvValues = readLocalEnvValues(cwd);
  const logger = options.logger ?? console.log;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sshKeygen = options.sshKeygen ?? defaultSshKeygen;

  const hcloudToken =
    options.hcloudToken ??
    parsedEnv.HCLOUD_TOKEN ??
    resolveLocalEnvValue("HCLOUD_TOKEN", env, localEnvValues);
  if (!hcloudToken) {
    throw new Error("Missing HCLOUD_TOKEN");
  }

  const sshKeyName =
    options.sshKeyName ??
    parsedEnv.HCLOUD_SSH_KEY_NAME ??
    resolveLocalEnvValue("HCLOUD_SSH_KEY_NAME", env, localEnvValues);
  if (!sshKeyName) {
    throw new Error("Missing HCLOUD_SSH_KEY_NAME");
  }

  const configuredKeyPath =
    options.privateKeyPath ??
    parsedEnv.KAMAL_SSH_PRIVATE_KEY_FILE ??
    resolveLocalEnvValue("KAMAL_SSH_PRIVATE_KEY_FILE", env, localEnvValues);
  const privateKeyPath = configuredKeyPath
    ? resolveLocalPath(configuredKeyPath, cwd)
    : join(homedir(), ".ssh", `${sanitizeSshKeyName(sshKeyName)}_ed25519`);
  const publicKeyPath = `${privateKeyPath}.pub`;

  let createdLocalKey = false;
  if (!existsSync(privateKeyPath)) {
    mkdirSync(dirname(privateKeyPath), { recursive: true, mode: 0o700 });
    sshKeygen.createEd25519KeyPair(privateKeyPath, sshKeyName);
    createdLocalKey = true;
  }
  chmodSync(privateKeyPath, 0o600);

  const publicKey = sshKeygen.derivePublicKey(privateKeyPath).trim();
  if (publicKey.length === 0) {
    throw new Error(`Unable to derive a public key from ${privateKeyPath}`);
  }

  if (!existsSync(publicKeyPath)) {
    writeFileSync(publicKeyPath, `${publicKey}\n`, "utf-8");
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
        cwd,
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
  const existingKeys = await parseHetznerSshKeysResponse(listResponse);
  const existingKey = existingKeys.find(
    (sshKey) => sshKey.name === options.sshKeyName,
  );

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

  if (!createResponse.ok) {
    throw new Error(
      `Hetzner SSH key create failed: ${await createResponse.text()}`,
    );
  }

  return true;
}

async function parseHetznerSshKeysResponse(
  response: Response,
): Promise<Array<z.infer<typeof hetznerSshKeySchema>>> {
  if (!response.ok) {
    throw new Error(`Hetzner SSH key lookup failed: ${await response.text()}`);
  }

  const body = await response.json();
  const parsed = hetznerSshKeysResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Hetzner SSH key lookup returned an invalid response");
  }

  return parsed.data.ssh_keys;
}

function sanitizeSshKeyName(sshKeyName: string): string {
  return sshKeyName.replace(/[^A-Za-z0-9._-]+/g, "_");
}
