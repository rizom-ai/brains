import { randomUUID } from "node:crypto";
import { JsonFileStore } from "./json-file-store";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";
import { join } from "node:path";
import type { RegisteredOAuthClient } from "./types";

const DEFAULT_CLIENT_STORE_FILE = "oauth-clients.json";

type TokenEndpointAuthMethod =
  "none" | "client_secret_basic" | "client_secret_post";

const tokenEndpointAuthMethodSchema: z.ZodType<
  TokenEndpointAuthMethod,
  TokenEndpointAuthMethod
> = z.enum(["none", "client_secret_basic", "client_secret_post"]);

export interface ClientRegistrationRequest {
  redirect_uris: string[];
  token_endpoint_auth_method?: TokenEndpointAuthMethod | undefined;
  grant_types?: ("authorization_code" | "refresh_token")[] | undefined;
  response_types?: "code"[] | undefined;
  scope?: string | undefined;
  client_name?: string | undefined;
  client_uri?: string | undefined;
  logo_uri?: string | undefined;
  contacts?: string[] | undefined;
}

interface ParsedClientRegistrationRequest {
  redirect_uris: string[];
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  grant_types: ("authorization_code" | "refresh_token")[];
  response_types: "code"[];
  scope?: string | undefined;
  client_name?: string | undefined;
  client_uri?: string | undefined;
  logo_uri?: string | undefined;
  contacts?: string[] | undefined;
}

const clientRegistrationRequestSchema: z.ZodType<
  ParsedClientRegistrationRequest,
  ClientRegistrationRequest
> = z.object({
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
  .transform((client): RegisteredOAuthClient => ({
    client_id: client.client_id,
    client_id_issued_at: client.client_id_issued_at,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
    grant_types: client.grant_types ?? ["authorization_code", "refresh_token"],
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
  }));

const clientStoreFileSchema = z.looseObject({
  clients: z.array(z.unknown()).optional(),
});

export interface OAuthClientStoreOptions {
  storageDir: string;
  storeFile?: string;
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
  private readonly store: JsonFileStore<ClientStoreFile>;

  constructor(options: OAuthClientStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(
        options.storageDir,
        options.storeFile ?? DEFAULT_CLIENT_STORE_FILE,
      ),
      parse: parseStoreFile,
      empty: (): ClientStoreFile => ({ clients: [] }),
    });
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

    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      store.clients.push(client);
      await this.store.write(store);
    });

    return client;
  }

  async getClient(
    clientId: string,
  ): Promise<RegisteredOAuthClient | undefined> {
    const store = await this.store.read();
    return store.clients.find((client) => client.client_id === clientId);
  }
}

export class InvalidClientMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClientMetadataError";
  }
}
