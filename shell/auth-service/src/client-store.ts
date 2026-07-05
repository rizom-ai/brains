import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { nowSeconds } from "@brains/utils/date";
import { JsonFileStore } from "./json-file-store";
import type { RegisteredOAuthClient } from "./types";

const DEFAULT_CLIENT_STORE_FILE = "oauth-clients.json";

const tokenEndpointAuthMethodSchema = z.enum([
  "none",
  "client_secret_basic",
  "client_secret_post",
]);

const clientRegistrationRequestSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  token_endpoint_auth_method: tokenEndpointAuthMethodSchema.default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).default(["code"]),
  scope: z.string().optional(),
  client_name: z.string().optional(),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  contacts: z.array(z.string()).optional(),
});

export type ClientRegistrationRequest = z.input<
  typeof clientRegistrationRequestSchema
>;

interface ClientStoreFile {
  clients: RegisteredOAuthClient[];
}

export interface OAuthClientStoreOptions {
  storageDir: string;
  storeFile?: string;
}

function createClientSecret(): string {
  return `ocs_${randomUUID().replaceAll("-", "")}`;
}

function parseStoreFile(value: unknown): ClientStoreFile {
  if (!value || typeof value !== "object") {
    return { clients: [] };
  }

  const clients = (value as { clients?: unknown }).clients;
  if (!Array.isArray(clients)) {
    return { clients: [] };
  }

  return {
    clients: clients.filter(isRegisteredOAuthClient),
  };
}

function isRegisteredOAuthClient(
  value: unknown,
): value is RegisteredOAuthClient {
  if (!value || typeof value !== "object") return false;
  const client = value as Record<string, unknown>;
  return (
    typeof client["client_id"] === "string" &&
    Array.isArray(client["redirect_uris"]) &&
    client["redirect_uris"].every((uri) => typeof uri === "string") &&
    typeof client["client_id_issued_at"] === "number"
  );
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
