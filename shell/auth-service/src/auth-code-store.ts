import { randomUUID } from "node:crypto";
import { sha256Base64Url } from "@brains/utils/hash";
import { nowSeconds } from "@brains/utils/date";
import { and, eq, isNull } from "drizzle-orm";
import { redirectUriMatches } from "./redirect-uri";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { oauthAuthCodes } from "./runtime-schema";

const AUTH_CODE_TTL_SECONDS = 10 * 60;

export interface AuthorizationCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope?: string;
  subject: string;
  created_at: number;
  expires_at: number;
  consumed_at?: number;
}

export interface CreateAuthorizationCodeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
  subject: string;
}

export interface ConsumeAuthorizationCodeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface AuthorizationCodePersistence {
  createCode(
    input: CreateAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord>;
  consumeCode(
    input: ConsumeAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord>;
}

async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

export class RuntimeAuthorizationCodeStore implements AuthorizationCodePersistence {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async createCode(
    input: CreateAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord> {
    const issuedAt = nowSeconds();
    const record: AuthorizationCodeRecord = {
      code: `ocd_${randomUUID()}`,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      ...(input.scope ? { scope: input.scope } : {}),
      subject: input.subject,
      created_at: issuedAt,
      expires_at: issuedAt + AUTH_CODE_TTL_SECONDS,
    };
    await this.database.db
      .insert(oauthAuthCodes)
      .values(codeToRow(record, input.subject));
    return record;
  }

  async consumeCode(
    input: ConsumeAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord> {
    const codeHash = hashCode(input.code);
    const [row] = await this.database.db
      .select()
      .from(oauthAuthCodes)
      .where(eq(oauthAuthCodes.codeHash, codeHash))
      .limit(1);
    if (!row) {
      throw new InvalidGrantError("Authorization code not found");
    }
    const now = nowSeconds();
    if (row.consumedAt !== null) {
      throw new InvalidGrantError("Authorization code already consumed");
    }
    if (row.expiresAt <= now) {
      throw new InvalidGrantError("Authorization code expired");
    }
    if (row.clientId !== input.clientId) {
      throw new InvalidGrantError("Authorization code client mismatch");
    }
    if (!redirectUriMatches(row.redirectUri, input.redirectUri)) {
      throw new InvalidGrantError("Authorization code redirect URI mismatch");
    }
    if (row.pkceChallenge !== (await pkceS256(input.codeVerifier))) {
      throw new InvalidGrantError("PKCE verification failed");
    }

    const consumed = await this.database.db
      .update(oauthAuthCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(oauthAuthCodes.codeHash, codeHash),
          isNull(oauthAuthCodes.consumedAt),
        ),
      )
      .returning({ codeHash: oauthAuthCodes.codeHash });
    if (consumed.length === 0) {
      throw new InvalidGrantError("Authorization code already consumed");
    }
    return {
      code: input.code,
      client_id: row.clientId,
      redirect_uri: row.redirectUri,
      code_challenge: row.pkceChallenge,
      code_challenge_method: "S256",
      ...(row.scope ? { scope: row.scope } : {}),
      subject: row.userId,
      created_at: row.createdAt,
      expires_at: row.expiresAt,
      consumed_at: now,
    };
  }
}

function codeToRow(
  record: AuthorizationCodeRecord,
  userId: string,
): typeof oauthAuthCodes.$inferInsert {
  return {
    codeHash: hashCode(record.code),
    clientId: record.client_id,
    userId,
    redirectUri: record.redirect_uri,
    pkceChallenge: record.code_challenge,
    scope: record.scope ?? "",
    expiresAt: record.expires_at,
    consumedAt: record.consumed_at ?? null,
    createdAt: record.created_at,
  };
}

function hashCode(code: string): string {
  return sha256Base64Url(code);
}

export class InvalidGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGrantError";
  }
}
