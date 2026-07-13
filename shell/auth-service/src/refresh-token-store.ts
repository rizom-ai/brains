import { createHash, randomUUID } from "node:crypto";
import { JsonFileStore } from "./json-file-store";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";
import { join } from "node:path";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { oauthRefreshTokens } from "./runtime-schema";

const DEFAULT_REFRESH_TOKEN_STORE_FILE = "oauth-refresh-tokens.json";
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

interface RefreshTokenStoreFile {
  refreshTokens: RefreshTokenRecord[];
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

export interface RefreshTokenStoreOptions {
  storageDir: string;
  storeFile?: string;
}

export interface RefreshTokenPersistence {
  issueToken(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken>;
  rotateToken(token: string, clientId: string): Promise<ConsumedRefreshToken>;
  revokeToken(token: string, clientId?: string): Promise<boolean>;
  revokeTokensForSubject(subject: string): Promise<number>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function createRefreshToken(): string {
  return `ort_${randomUUID()}`;
}

const refreshTokenRecordSchema = z
  .looseObject({
    id: z.string(),
    token_hash: z.string(),
    client_id: z.string(),
    subject: z.string(),
    scope: z.string().optional(),
    created_at: z.number(),
    expires_at: z.number(),
    revoked_at: z.number().optional(),
    replaced_by: z.string().optional(),
  })
  .transform((token): RefreshTokenRecord => ({
    id: token.id,
    token_hash: token.token_hash,
    client_id: token.client_id,
    subject: token.subject,
    ...(token.scope !== undefined ? { scope: token.scope } : {}),
    created_at: token.created_at,
    expires_at: token.expires_at,
    ...(token.revoked_at !== undefined ? { revoked_at: token.revoked_at } : {}),
    ...(token.replaced_by !== undefined
      ? { replaced_by: token.replaced_by }
      : {}),
  }));

const refreshTokenStoreFileSchema = z.looseObject({
  refreshTokens: z.array(z.unknown()).optional(),
});

function parseStoreFile(value: unknown): RefreshTokenStoreFile {
  const parsed = refreshTokenStoreFileSchema.safeParse(value);
  if (!parsed.success) return { refreshTokens: [] };

  return {
    refreshTokens: parsed.data.refreshTokens?.flatMap(parseRefreshToken) ?? [],
  };
}

function parseRefreshToken(value: unknown): RefreshTokenRecord[] {
  const parsed = refreshTokenRecordSchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

function pruneExpired(store: RefreshTokenStoreFile): RefreshTokenStoreFile {
  const now = nowSeconds();
  return {
    refreshTokens: store.refreshTokens.filter(
      (token) => token.expires_at > now,
    ),
  };
}

export class RuntimeRefreshTokenStore implements RefreshTokenPersistence {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async importToken(record: RefreshTokenRecord): Promise<boolean> {
    if (record.revoked_at !== undefined || record.expires_at <= nowSeconds()) {
      return false;
    }
    const inserted = await this.database.db
      .insert(oauthRefreshTokens)
      .values(refreshTokenToRow(record))
      .onConflictDoNothing()
      .returning({ tokenHash: oauthRefreshTokens.tokenHash });
    return inserted.length > 0;
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

export class RefreshTokenStore implements RefreshTokenPersistence {
  private readonly store: JsonFileStore<RefreshTokenStoreFile>;

  constructor(options: RefreshTokenStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(
        options.storageDir,
        options.storeFile ?? DEFAULT_REFRESH_TOKEN_STORE_FILE,
      ),
      parse: parseStoreFile,
      empty: (): RefreshTokenStoreFile => ({ refreshTokens: [] }),
    });
  }

  async issueToken(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken> {
    const issued = this.createRecord(input);
    await this.store.enqueueWrite(async () => {
      const store = pruneExpired(await this.store.read());
      store.refreshTokens.push(issued.record);
      await this.store.write(store);
    });
    return issued;
  }

  async rotateToken(
    token: string,
    clientId: string,
  ): Promise<ConsumedRefreshToken> {
    const tokenHash = hashToken(token);
    const now = nowSeconds();
    let result: ConsumedRefreshToken | undefined;

    await this.store.enqueueWrite(async () => {
      const store = pruneExpired(await this.store.read());
      const existing = store.refreshTokens.find(
        (record) => record.token_hash === tokenHash,
      );
      if (!existing) {
        throw new InvalidRefreshTokenError("Refresh token not found");
      }
      if (existing.client_id !== clientId) {
        throw new InvalidRefreshTokenError("Refresh token client mismatch");
      }
      if (existing.revoked_at !== undefined) {
        throw new InvalidRefreshTokenError("Refresh token revoked");
      }
      if (existing.expires_at <= now) {
        throw new InvalidRefreshTokenError("Refresh token expired");
      }

      const replacement = this.createRecord({
        clientId: existing.client_id,
        subject: existing.subject,
        ...(existing.scope ? { scope: existing.scope } : {}),
      });
      existing.revoked_at = now;
      existing.replaced_by = replacement.record.id;
      store.refreshTokens.push(replacement.record);
      await this.store.write(store);
      result = { consumed: existing, replacement };
    });

    if (!result) {
      throw new InvalidRefreshTokenError("Refresh token not rotated");
    }
    return result;
  }

  async revokeToken(token: string, clientId?: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    const now = nowSeconds();
    let revoked = false;

    await this.store.enqueueWrite(async () => {
      const store = pruneExpired(await this.store.read());
      const existing = store.refreshTokens.find(
        (record) => record.token_hash === tokenHash,
      );
      if (existing && (!clientId || existing.client_id === clientId)) {
        existing.revoked_at = now;
        revoked = true;
      }
      await this.store.write(store);
    });

    return revoked;
  }

  async listTokens(): Promise<RefreshTokenRecord[]> {
    return (await this.store.read()).refreshTokens;
  }

  async revokeTokensForSubject(subject: string): Promise<number> {
    const now = nowSeconds();
    let revoked = 0;

    await this.store.enqueueWrite(async () => {
      const store = pruneExpired(await this.store.read());
      for (const token of store.refreshTokens) {
        if (token.subject === subject && token.revoked_at === undefined) {
          token.revoked_at = now;
          revoked += 1;
        }
      }
      if (revoked > 0) {
        await this.store.write(store);
      }
    });

    return revoked;
  }

  private createRecord(input: IssueRefreshTokenInput): IssuedRefreshToken {
    return createIssuedRefreshToken(input);
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
