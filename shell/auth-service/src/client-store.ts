import { randomUUID, timingSafeEqual } from "node:crypto";
import { hashToken } from "./token-hash";
import { and, eq, lt, notExists, sql } from "drizzle-orm";
import { provisionOAuthClientInputSchema } from "@brains/contracts";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";
import type { AuthRuntimeDatabase } from "./runtime-db";
import {
  oauthAuthCodes,
  oauthClients,
  oauthRefreshTokens,
} from "./runtime-schema";
import type { RegisteredOAuthClient } from "./types";
import { applicationTypeRedirectRefusal } from "./redirect-uri";
import { definedFields } from "@brains/utils/strip-undefined";

const tokenEndpointAuthMethodSchema: z.ZodEnum<{
  none: "none";
  client_secret_basic: "client_secret_basic";
  client_secret_post: "client_secret_post";
}> = z.enum(["none", "client_secret_basic", "client_secret_post"]);

const clientRegistrationRequestSchema: z.ZodObject<{
  redirect_uris: z.ZodArray<z.ZodURL>;
  application_type: z.ZodOptional<z.ZodEnum<{ native: "native"; web: "web" }>>;
  token_endpoint_auth_method: z.ZodDefault<
    typeof tokenEndpointAuthMethodSchema
  >;
  grant_types: z.ZodDefault<
    z.ZodArray<
      z.ZodEnum<{
        authorization_code: "authorization_code";
        refresh_token: "refresh_token";
      }>
    >
  >;
  response_types: z.ZodDefault<z.ZodArray<z.ZodLiteral<"code">>>;
  scope: z.ZodOptional<z.ZodString>;
  client_name: z.ZodOptional<z.ZodString>;
  client_uri: z.ZodOptional<z.ZodURL>;
  logo_uri: z.ZodOptional<z.ZodURL>;
  contacts: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  redirect_uris: z.array(z.url()).min(1),
  application_type: z.enum(["native", "web"]).optional(),
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

const persistedOAuthClientSchema = z
  .looseObject({
    client_id: z.string(),
    client_id_issued_at: z.number(),
    redirect_uris: z.array(z.string()),
    application_type: z.enum(["native", "web"]).optional(),
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
    ...(client.application_type !== undefined
      ? { application_type: client.application_type }
      : {}),
    token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
    grant_types: client.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: client.response_types ?? ["code"],
    ...definedFields({ scope: client.scope }),
    ...(client.client_name !== undefined
      ? { client_name: client.client_name }
      : {}),
    ...(client.client_uri !== undefined
      ? { client_uri: client.client_uri }
      : {}),
    ...definedFields({
      logo_uri: client.logo_uri,
      contacts: client.contacts,
    }),
    ...(client.client_secret !== undefined
      ? { client_secret: client.client_secret }
      : {}),
    ...(client.client_secret_expires_at !== undefined
      ? { client_secret_expires_at: client.client_secret_expires_at }
      : {}),
  }));

export interface OAuthClientPersistence {
  registerClient(
    input: unknown,
    issuer?: string,
  ): Promise<RegisteredOAuthClient>;
  upsertClientMetadataDocument(
    client: RegisteredOAuthClient,
  ): Promise<RegisteredOAuthClient>;
  getClient(
    clientId: string,
    issuer?: string,
  ): Promise<RegisteredOAuthClient | undefined>;
  validateClientCredentials(
    clientId: string,
    clientSecret?: string,
    issuer?: string,
  ): Promise<string | undefined>;
  pruneStaleUnconsentedClients?(createdBefore: number): Promise<number>;
}

function createClientSecret(): string {
  return `ocs_${randomUUID().replaceAll("-", "")}`;
}

export class RuntimeOAuthClientStore implements OAuthClientPersistence {
  private readonly database: AuthRuntimeDatabase;
  private readonly defaultIssuer: string | undefined;

  constructor(database: AuthRuntimeDatabase, defaultIssuer?: string) {
    this.database = database;
    this.defaultIssuer = defaultIssuer;
  }

  async registerClient(
    input: unknown,
    issuer: string | undefined = this.defaultIssuer,
  ): Promise<RegisteredOAuthClient> {
    const client = createRegisteredClient(input);
    await this.database.db.insert(oauthClients).values(
      clientToRow(client, {
        method: "dynamic",
        ...(issuer ? { issuer } : {}),
      }),
    );
    return client;
  }

  /**
   * Register or update a confidential client under the id and secret the
   * caller chose. Provisioning again replaces the secret, name and redirect
   * URIs, so a plugin can re-provision on every start.
   */
  async provisionClient(input: unknown): Promise<RegisteredOAuthClient> {
    const parsed = provisionOAuthClientInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidClientMetadataError(parsed.error.message);
    }
    const existing = await this.getPersistedClient(parsed.data.clientId);
    const client: RegisteredOAuthClient = {
      client_id: parsed.data.clientId,
      client_id_issued_at: existing?.client.client_id_issued_at ?? nowSeconds(),
      redirect_uris: parsed.data.redirectUris,
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: parsed.data.clientName,
      client_secret: parsed.data.clientSecret,
      client_secret_expires_at: 0,
    };
    const row = clientToRow(client, { method: "provisioned" });
    await this.database.db
      .insert(oauthClients)
      .values(row)
      .onConflictDoUpdate({
        target: oauthClients.clientId,
        set: {
          secretHash: row.secretHash,
          metadataJson: row.metadataJson,
          updatedAt: nowSeconds(),
        },
      });
    return client;
  }

  async upsertClientMetadataDocument(
    client: RegisteredOAuthClient,
  ): Promise<RegisteredOAuthClient> {
    const existing = await this.getPersistedClient(client.client_id);
    const persistedClient = {
      ...client,
      client_id_issued_at:
        existing?.client.client_id_issued_at ?? client.client_id_issued_at,
    };
    const row = clientToRow(persistedClient, {
      method: "metadata_document",
    });
    await this.database.db
      .insert(oauthClients)
      .values(row)
      .onConflictDoUpdate({
        target: oauthClients.clientId,
        set: {
          secretHash: null,
          metadataJson: row.metadataJson,
          updatedAt: nowSeconds(),
        },
      });
    return persistedClient;
  }

  async getClient(
    clientId: string,
    issuer?: string,
  ): Promise<RegisteredOAuthClient | undefined> {
    const persisted = await this.getPersistedClient(clientId);
    if (!persisted || !this.isAvailableToIssuer(persisted, issuer)) {
      return undefined;
    }
    return persisted.client;
  }

  async validateClientCredentials(
    clientId: string,
    clientSecret?: string,
    issuer?: string,
  ): Promise<string | undefined> {
    const [row] = await this.database.db
      .select({
        metadataJson: oauthClients.metadataJson,
        secretHash: oauthClients.secretHash,
      })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    if (!row) return "Unknown client_id";
    const persisted = parsePersistedClient(row.metadataJson);
    if (!this.isAvailableToIssuer(persisted, issuer)) {
      return "Unknown client_id";
    }
    if (!row.secretHash) return undefined;
    if (
      !clientSecret ||
      !constantTimeEqual(row.secretHash, hashToken(clientSecret))
    ) {
      return "Invalid client secret";
    }
    return undefined;
  }

  private async getPersistedClient(
    clientId: string,
  ): Promise<PersistedOAuthClient | undefined> {
    const [row] = await this.database.db
      .select({ metadataJson: oauthClients.metadataJson })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    return row ? parsePersistedClient(row.metadataJson) : undefined;
  }

  private isAvailableToIssuer(
    persisted: PersistedOAuthClient,
    issuer?: string,
  ): boolean {
    if (!issuer || persisted.registration.method !== "dynamic") {
      return true;
    }
    const registrationIssuer =
      persisted.registration.issuer ?? this.defaultIssuer;
    return !registrationIssuer || registrationIssuer === issuer;
  }

  async pruneStaleUnconsentedClients(createdBefore: number): Promise<number> {
    const deleted = await this.database.db
      .delete(oauthClients)
      .where(
        and(
          lt(oauthClients.createdAt, createdBefore),
          // A provisioned client belongs to a plugin, not to a visitor
          // who may never come back.
          sql`coalesce(json_extract(${oauthClients.metadataJson}, '$._brains_registration.method'), '') != 'provisioned'`,
          notExists(
            this.database.db
              .select({ clientId: oauthAuthCodes.clientId })
              .from(oauthAuthCodes)
              .where(eq(oauthAuthCodes.clientId, oauthClients.clientId)),
          ),
          notExists(
            this.database.db
              .select({ clientId: oauthRefreshTokens.clientId })
              .from(oauthRefreshTokens)
              .where(eq(oauthRefreshTokens.clientId, oauthClients.clientId)),
          ),
        ),
      )
      .returning({ clientId: oauthClients.clientId });
    return deleted.length;
  }
}

function createRegisteredClient(input: unknown): RegisteredOAuthClient {
  const parsed = clientRegistrationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidClientMetadataError(parsed.error.message);
  }

  const metadata = parsed.data;
  const redirectRefusal = applicationTypeRedirectRefusal(metadata);
  if (redirectRefusal) throw new InvalidClientMetadataError(redirectRefusal);
  const issuedAt = nowSeconds();
  const clientId = `oc_${randomUUID()}`;
  const isPublicClient = metadata.token_endpoint_auth_method === "none";
  return {
    client_id: clientId,
    client_id_issued_at: issuedAt,
    redirect_uris: metadata.redirect_uris,
    ...(metadata.application_type
      ? { application_type: metadata.application_type }
      : {}),
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
}

function clientToRow(
  client: RegisteredOAuthClient,
  registration: OAuthClientRegistration,
): typeof oauthClients.$inferInsert {
  const { client_secret: secret, ...metadata } = client;
  return {
    clientId: client.client_id,
    secretHash: secret ? hashToken(secret) : null,
    metadataJson: JSON.stringify({
      ...metadata,
      _brains_registration: registration,
    }),
    createdAt: client.client_id_issued_at,
    updatedAt: client.client_id_issued_at,
  };
}

interface OAuthClientRegistration {
  method: "dynamic" | "metadata_document" | "provisioned";
  issuer?: string;
}

interface PersistedOAuthClient {
  client: RegisteredOAuthClient;
  registration: OAuthClientRegistration;
}

const oauthClientRegistrationSchema = z.object({
  method: z.enum(["dynamic", "metadata_document", "provisioned"]),
  issuer: z.string().optional(),
});

function parsePersistedClient(metadataJson: string): PersistedOAuthClient {
  const parsedJson: unknown = JSON.parse(metadataJson);
  const client = persistedOAuthClientSchema.safeParse(parsedJson);
  if (!client.success) {
    throw new Error("Stored OAuth client metadata is invalid");
  }

  const registration = z
    .looseObject({ _brains_registration: oauthClientRegistrationSchema })
    .safeParse(parsedJson);
  const storedRegistration = registration.success
    ? registration.data._brains_registration
    : undefined;
  return {
    client: client.data,
    registration: storedRegistration
      ? {
          method: storedRegistration.method,
          ...(storedRegistration.issuer
            ? { issuer: storedRegistration.issuer }
            : {}),
        }
      : { method: "dynamic" },
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export class InvalidClientMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClientMetadataError";
  }
}
