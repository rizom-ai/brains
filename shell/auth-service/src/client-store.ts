import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod-v4";
import type { RegisteredOAuthClient } from "./types";

const DEFAULT_CLIENT_STORE_FILE = "oauth-clients.json";

const tokenEndpointAuthMethodSchema = z.enum([
  "none",
  "client_secret_basic",
  "client_secret_post",
]);

const clientRegistrationRequestSchema = z.object({
  redirect_uris: z.array(z.url()).min(1),
  token_endpoint_auth_method: tokenEndpointAuthMethodSchema.default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).default(["code"]),
  scope: z.string().optional(),
  client_name: z.string().optional(),
  client_uri: z.url().optional(),
  logo_uri: z.url().optional(),
  contacts: z.array(z.string()).optional(),
});

export type ClientRegistrationRequest = z.input<
  typeof clientRegistrationRequestSchema
>;

interface ClientStoreFile {
  clients: RegisteredOAuthClient[];
}

const persistedOAuthClientSchema = z
  .looseObject({
    client_id: z.string(),
    client_id_issued_at: z.number(),
    redirect_uris: z.array(z.string()),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    scope: z.string().optional(),
    client_name: z.string().optional(),
    client_uri: z.string().optional(),
    logo_uri: z.string().optional(),
    contacts: z.array(z.string()).optional(),
    client_secret: z.string().optional(),
    client_secret_expires_at: z.number().optional(),
  })
  .transform(
    (client): RegisteredOAuthClient => ({
      client_id: client.client_id,
      client_id_issued_at: client.client_id_issued_at,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
      grant_types: client.grant_types ?? [
        "authorization_code",
        "refresh_token",
      ],
      response_types: client.response_types ?? ["code"],
      ...(client.scope !== undefined ? { scope: client.scope } : {}),
      ...(client.client_name !== undefined
        ? { client_name: client.client_name }
        : {}),
      ...(client.client_uri !== undefined
        ? { client_uri: client.client_uri }
        : {}),
      ...(client.logo_uri !== undefined ? { logo_uri: client.logo_uri } : {}),
      ...(client.contacts !== undefined ? { contacts: client.contacts } : {}),
      ...(client.client_secret !== undefined
        ? { client_secret: client.client_secret }
        : {}),
      ...(client.client_secret_expires_at !== undefined
        ? { client_secret_expires_at: client.client_secret_expires_at }
        : {}),
    }),
  );

const clientStoreFileSchema = z.looseObject({
  clients: z.array(z.unknown()).optional(),
});

export interface OAuthClientStoreOptions {
  storageDir: string;
  storeFile?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function createClientSecret(): string {
  return `ocs_${randomUUID().replaceAll("-", "")}`;
}

function parseStoreFile(value: unknown): ClientStoreFile {
  const parsed = clientStoreFileSchema.safeParse(value);
  if (!parsed.success) return { clients: [] };

  return {
    clients: parsed.data.clients?.flatMap(parsePersistedClient) ?? [],
  };
}

function parsePersistedClient(value: unknown): RegisteredOAuthClient[] {
  const parsed = persistedOAuthClientSchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

export class OAuthClientStore {
  private readonly storeFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: OAuthClientStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_CLIENT_STORE_FILE,
    );
  }

  async registerClient(input: unknown): Promise<RegisteredOAuthClient> {
    const parsed = clientRegistrationRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidClientMetadataError(parsed.error.message);
    }

    const metadata = parsed.data;
    const issuedAt = nowSeconds();
    const clientId = `oc_${randomUUID()}`;
    const isPublicClient = metadata.token_endpoint_auth_method === "none";

    const client: RegisteredOAuthClient = {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      redirect_uris: metadata.redirect_uris,
      token_endpoint_auth_method: metadata.token_endpoint_auth_method,
      grant_types: metadata.grant_types,
      response_types: metadata.response_types,
      ...(metadata.scope ? { scope: metadata.scope } : {}),
      ...(metadata.client_name ? { client_name: metadata.client_name } : {}),
      ...(metadata.client_uri ? { client_uri: metadata.client_uri } : {}),
      ...(metadata.logo_uri ? { logo_uri: metadata.logo_uri } : {}),
      ...(metadata.contacts ? { contacts: metadata.contacts } : {}),
      ...(!isPublicClient
        ? {
            client_secret: createClientSecret(),
            client_secret_expires_at: 0,
          }
        : {}),
    };

    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      store.clients.push(client);
      await this.writeStore(store);
    });

    return client;
  }

  async getClient(
    clientId: string,
  ): Promise<RegisteredOAuthClient | undefined> {
    const store = await this.readStore();
    return store.clients.find((client) => client.client_id === clientId);
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async readStore(): Promise<ClientStoreFile> {
    try {
      return parseStoreFile(
        JSON.parse(await readFile(this.storeFile, "utf8")) as unknown,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { clients: [] };
      }
      throw error;
    }
  }

  private async writeStore(store: ClientStoreFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
  }
}

export class InvalidClientMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClientMetadataError";
  }
}
