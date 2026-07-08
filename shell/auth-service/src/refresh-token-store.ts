import { createHash, randomUUID } from "node:crypto";
import { JsonFileStore } from "./json-file-store";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";
import { join } from "node:path";

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

export class RefreshTokenStore {
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

  private createRecord(input: IssueRefreshTokenInput): IssuedRefreshToken {
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
}

export class InvalidRefreshTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRefreshTokenError";
  }
}
