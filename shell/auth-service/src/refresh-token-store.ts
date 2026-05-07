import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";

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

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function createRefreshToken(): string {
  return `ort_${randomUUID()}`;
}

function isRefreshTokenRecord(value: unknown): value is RefreshTokenRecord {
  if (!value || typeof value !== "object") return false;
  const token = value as Record<string, unknown>;
  return (
    typeof token["id"] === "string" &&
    typeof token["token_hash"] === "string" &&
    typeof token["client_id"] === "string" &&
    typeof token["subject"] === "string" &&
    typeof token["created_at"] === "number" &&
    typeof token["expires_at"] === "number"
  );
}

function parseStoreFile(value: unknown): RefreshTokenStoreFile {
  if (!value || typeof value !== "object") return { refreshTokens: [] };
  const refreshTokens = (value as { refreshTokens?: unknown }).refreshTokens;
  if (!Array.isArray(refreshTokens)) return { refreshTokens: [] };
  return {
    refreshTokens: refreshTokens.filter(isRefreshTokenRecord),
  };
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
  private readonly storeFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: RefreshTokenStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_REFRESH_TOKEN_STORE_FILE,
    );
  }

  async issueToken(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken> {
    const issued = this.createRecord(input);
    await this.enqueueWrite(async () => {
      const store = pruneExpired(await this.readStore());
      store.refreshTokens.push(issued.record);
      await this.writeStore(store);
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

    await this.enqueueWrite(async () => {
      const store = pruneExpired(await this.readStore());
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
      await this.writeStore(store);
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

    await this.enqueueWrite(async () => {
      const store = pruneExpired(await this.readStore());
      const existing = store.refreshTokens.find(
        (record) => record.token_hash === tokenHash,
      );
      if (existing && (!clientId || existing.client_id === clientId)) {
        existing.revoked_at = now;
        revoked = true;
      }
      await this.writeStore(store);
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

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async readStore(): Promise<RefreshTokenStoreFile> {
    try {
      return parseStoreFile(
        JSON.parse(await readFile(this.storeFile, "utf8")) as unknown,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { refreshTokens: [] };
      }
      throw error;
    }
  }

  private async writeStore(store: RefreshTokenStoreFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRefreshTokenError";
  }
}
