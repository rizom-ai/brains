import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { renderHomeserverConfig } from "./homeserver-config";

/** Where the homeserver keeps its database and configuration, inside its container. */
export const HOMESERVER_CONTAINER_DATA = "/data";
/** The port the homeserver listens on inside its container. */
export const HOMESERVER_PORT = 8008;
const CONFIG_FILE = "tuwunel.toml";

export interface HomeserverSecrets {
  registrationToken: string;
  oidcClientSecret: string;
  /** Derived from the registration token, so the file holds every secret. */
  botPassword: string;
}

export interface EnsureHomeserverConfigInput {
  /** The directory the brain and the homeserver both mount. */
  dataDir: string;
  serverName: string;
  publicBaseUrl: string;
}

const storedSecretsSchema = z.object({
  global: z.object({
    registration_token: z.string().min(32),
    identity_provider: z
      .array(z.object({ client_secret: z.string().min(32) }))
      .min(1),
  }),
});

/**
 * The homeserver's configuration, which the brain owns. On the first boot it
 * writes the file with fresh secrets; afterwards it keeps the secrets the
 * file holds and rewrites the file only when something else in it changed,
 * such as the domain. The secrets live in that file alone, next to the
 * homeserver's database, so a backup or restore takes them together.
 */
export async function ensureHomeserverConfig(
  input: EnsureHomeserverConfigInput,
): Promise<{ secrets: HomeserverSecrets; changed: boolean }> {
  const path = join(input.dataDir, CONFIG_FILE);
  const existing = await readText(path);
  const stored = existing === undefined ? undefined : storedSecrets(existing);
  const registrationToken = stored?.registrationToken ?? freshSecret();
  const oidcClientSecret = stored?.oidcClientSecret ?? freshSecret();
  const config = renderHomeserverConfig({
    serverName: input.serverName,
    publicBaseUrl: input.publicBaseUrl,
    registrationToken,
    oidcClientSecret,
    databasePath: `${HOMESERVER_CONTAINER_DATA}/db`,
    backupPath: `${HOMESERVER_CONTAINER_DATA}/backup`,
    port: HOMESERVER_PORT,
  });
  const changed = config !== existing;
  if (changed) {
    await mkdir(input.dataDir, { recursive: true });
    // Written beside it and renamed, so the homeserver never reads half a file.
    const staged = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(staged, config, { mode: 0o600 });
    await rename(staged, path);
  }
  return {
    secrets: withBotPassword({ registrationToken, oidcClientSecret }),
    changed,
  };
}

/** The secrets in the file, for a process that must not write it. */
export async function readHomeserverSecrets(
  dataDir: string,
): Promise<HomeserverSecrets | undefined> {
  const existing = await readText(join(dataDir, CONFIG_FILE));
  return existing === undefined
    ? undefined
    : withBotPassword(storedSecrets(existing));
}

function storedSecrets(config: string): Omit<HomeserverSecrets, "botPassword"> {
  const parsed = storedSecretsSchema.safeParse(Bun.TOML.parse(config));
  if (!parsed.success) {
    throw new Error(
      `The homeserver configuration lacks a registration_token or client_secret the brain wrote; move it aside to let the brain write a new one: ${parsed.error.message}`,
    );
  }
  const [provider] = parsed.data.global.identity_provider;
  return {
    registrationToken: parsed.data.global.registration_token,
    oidcClientSecret: provider?.client_secret ?? "",
  };
}

function withBotPassword(
  secrets: Omit<HomeserverSecrets, "botPassword">,
): HomeserverSecrets {
  return {
    ...secrets,
    botPassword: createHmac("sha256", secrets.registrationToken)
      .update("matrix bot password")
      .digest("base64url"),
  };
}

function freshSecret(): string {
  return randomBytes(32).toString("base64url");
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    // No file yet is the first boot; anything else is a real failure.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
