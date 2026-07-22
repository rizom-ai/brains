import { randomUUID } from "node:crypto";
import { sha256Base64Url } from "@brains/utils/hash";
import { nowSeconds } from "@brains/utils/date";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { oauthRefreshTokens } from "./runtime-schema";

const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface RefreshTokenRecord {
  id: string;
  token_hash: string;
  client_id: string;
  subject: string;
  scope?: string;
  created_at: number;
  expires_at: number;
  revoked_at?: number;
  replaced_by?: string;
}

export interface IssueRefreshTokenInput {
  clientId: string;
  subject: string;
  scope?: string;
}

export interface IssuedRefreshToken {
  token: string;
  record: RefreshTokenRecord;
}

export interface ConsumedRefreshToken {
  consumed: RefreshTokenRecord;
  replacement: IssuedRefreshToken;
}

export interface RefreshTokenPersistence {
  issueToken(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken>;
  rotateToken(token: string, clientId: string): Promise<ConsumedRefreshToken>;
  revokeToken(token: string, clientId?: string): Promise<boolean>;
  revokeTokensForSubject(subject: string): Promise<number>;
}

function hashToken(token: string): string {
  return sha256Base64Url(token);
}

function createRefreshToken(): string {
  return `ort_${randomUUID()}`;
}

export class RuntimeRefreshTokenStore implements RefreshTokenPersistence {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async issueToken(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken> {
    const issued = createIssuedRefreshToken(input);
    await this.database.db
      .insert(oauthRefreshTokens)
      .values(refreshTokenToRow(issued.record));
    return issued;
  }

  async rotateToken(
    token: string,
    clientId: string,
  ): Promise<ConsumedRefreshToken> {
    const tokenHash = hashToken(token);
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(oauthRefreshTokens)
        .where(eq(oauthRefreshTokens.tokenHash, tokenHash))
        .limit(1);
      if (!existing) {
        throw new InvalidRefreshTokenError("Refresh token not found");
      }
      if (existing.clientId !== clientId) {
        throw new InvalidRefreshTokenError("Refresh token client mismatch");
      }
      if (existing.revokedAt !== null) {
        throw new InvalidRefreshTokenError("Refresh token revoked");
      }
      const now = nowSeconds();
      if (existing.expiresAt <= now) {
        throw new InvalidRefreshTokenError("Refresh token expired");
      }

      const replacement = createIssuedRefreshToken({
        clientId: existing.clientId,
        subject: existing.userId,
        ...(existing.scope ? { scope: existing.scope } : {}),
      });
      const updated = await tx
        .update(oauthRefreshTokens)
        .set({
          revokedAt: now,
          replacedByHash: replacement.record.token_hash,
        })
        .where(
          and(
            eq(oauthRefreshTokens.tokenHash, tokenHash),
            isNull(oauthRefreshTokens.revokedAt),
          ),
        )
        .returning({ tokenHash: oauthRefreshTokens.tokenHash });
      if (updated.length === 0) {
        throw new InvalidRefreshTokenError("Refresh token revoked");
      }
      await tx
        .insert(oauthRefreshTokens)
        .values(refreshTokenToRow(replacement.record));

      return {
        consumed: {
          ...refreshTokenFromRow(existing),
          revoked_at: now,
          replaced_by: replacement.record.token_hash,
        },
        replacement,
      };
    });
  }

  async revokeToken(token: string, clientId?: string): Promise<boolean> {
    const conditions = [
      eq(oauthRefreshTokens.tokenHash, hashToken(token)),
      isNull(oauthRefreshTokens.revokedAt),
    ];
    if (clientId) {
      conditions.push(eq(oauthRefreshTokens.clientId, clientId));
    }
    const revoked = await this.database.db
      .update(oauthRefreshTokens)
      .set({ revokedAt: nowSeconds() })
      .where(and(...conditions))
      .returning({ tokenHash: oauthRefreshTokens.tokenHash });
    return revoked.length > 0;
  }

  async revokeTokensForSubject(subject: string): Promise<number> {
    const revoked = await this.database.db
      .update(oauthRefreshTokens)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          eq(oauthRefreshTokens.userId, subject),
          isNull(oauthRefreshTokens.revokedAt),
          gt(oauthRefreshTokens.expiresAt, nowSeconds()),
        ),
      )
      .returning({ tokenHash: oauthRefreshTokens.tokenHash });
    return revoked.length;
  }
}

function createIssuedRefreshToken(
  input: IssueRefreshTokenInput,
): IssuedRefreshToken {
  const token = createRefreshToken();
  const issuedAt = nowSeconds();
  const record: RefreshTokenRecord = {
    id: randomUUID(),
    token_hash: hashToken(token),
    client_id: input.clientId,
    subject: input.subject,
    ...(input.scope ? { scope: input.scope } : {}),
    created_at: issuedAt,
    expires_at: issuedAt + REFRESH_TOKEN_TTL_SECONDS,
  };
  return { token, record };
}

function refreshTokenToRow(
  record: RefreshTokenRecord,
): typeof oauthRefreshTokens.$inferInsert {
  return {
    tokenHash: record.token_hash,
    clientId: record.client_id,
    userId: record.subject,
    scope: record.scope ?? "",
    expiresAt: record.expires_at,
    revokedAt: record.revoked_at ?? null,
    replacedByHash: record.replaced_by ?? null,
    createdAt: record.created_at,
  };
}

function refreshTokenFromRow(
  row: typeof oauthRefreshTokens.$inferSelect,
): RefreshTokenRecord {
  return {
    id: row.tokenHash,
    token_hash: row.tokenHash,
    client_id: row.clientId,
    subject: row.userId,
    ...(row.scope ? { scope: row.scope } : {}),
    created_at: row.createdAt,
    expires_at: row.expiresAt,
    ...(row.revokedAt !== null ? { revoked_at: row.revokedAt } : {}),
    ...(row.replacedByHash ? { replaced_by: row.replacedByHash } : {}),
  };
}

export class InvalidRefreshTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRefreshTokenError";
  }
}
