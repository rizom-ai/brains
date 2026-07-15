import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { JsonFileStore } from "./json-file-store";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";
import { join } from "node:path";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { authSessions } from "./runtime-schema";

const DEFAULT_SESSION_STORE_FILE = "oauth-sessions.json";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const AUTH_SESSION_COOKIE = "brains_auth_session";
/**
 * TODO(auth-session-compat): Remove the legacy cookie reader when both
 * conditions are true:
 * 1. Repository consumers use only AuthSession APIs.
 * 2. The minimum supported upgrade source already issues
 *    `brains_auth_session` (so pre-migration browser sessions are no longer a
 *    supported direct-upgrade case).
 *
 * Until then, issue only AUTH_SESSION_COOKIE, dual-read both names, and clear
 * both names on logout.
 */
const LEGACY_OPERATOR_SESSION_COOKIE = "brains_operator_session";
export interface AuthSessionRecord {
  id: string;
  token_hash: string;
  subject: string;
  created_at: number;
  expires_at: number;
}

interface SessionStoreFile {
  sessions: AuthSessionRecord[];
}

export interface CreateAuthSessionResult {
  subject: string;
  cookie: string;
  expiresAt: number;
}

export interface AuthSessionStoreOptions {
  storageDir: string;
  storeFile?: string;
}

export interface AuthSessionPersistence {
  createSession(
    subject: string,
    options?: { secure?: boolean },
  ): Promise<CreateAuthSessionResult>;
  getSessionFromRequest(
    request: Request,
  ): Promise<AuthSessionRecord | undefined>;
  revokeSessionFromRequest(request: Request): Promise<boolean>;
  revokeSessionsForSubject(subject: string): Promise<number>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

const authSessionRecordSchema = z.looseObject({
  id: z.string(),
  token_hash: z.string(),
  subject: z.string(),
  created_at: z.number(),
  expires_at: z.number(),
});

const sessionStoreFileSchema = z.looseObject({
  sessions: z.array(authSessionRecordSchema).optional(),
});

function parseStoreFile(value: unknown): SessionStoreFile {
  const parsed = sessionStoreFileSchema.safeParse(value);
  return { sessions: parsed.success ? (parsed.data.sessions ?? []) : [] };
}

function sessionCookie(
  token: string,
  expiresAt: number,
  secure: boolean,
): string {
  return `${AUTH_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(
    0,
    expiresAt - nowSeconds(),
  )}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    secure ? "; Secure" : ""
  }`;
}

export function clearAuthSessionCookie(secure = false): string {
  return clearSessionCookie(AUTH_SESSION_COOKIE, secure);
}

function clearLegacyAuthSessionCookie(secure = false): string {
  return clearSessionCookie(LEGACY_OPERATOR_SESSION_COOKIE, secure);
}

export function clearAuthSessionCookies(secure = false): [string, string] {
  return [clearAuthSessionCookie(secure), clearLegacyAuthSessionCookie(secure)];
}

export class RuntimeAuthSessionStore implements AuthSessionPersistence {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async importSession(
    session: AuthSessionRecord,
    userId: string,
  ): Promise<boolean> {
    const inserted = await this.database.db
      .insert(authSessions)
      .values({
        tokenHash: session.token_hash,
        userId,
        expiresAt: session.expires_at,
        revokedAt: null,
        createdAt: session.created_at,
      })
      .onConflictDoNothing()
      .returning({ tokenHash: authSessions.tokenHash });
    return inserted.length > 0;
  }

  async createSession(
    subject: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateAuthSessionResult> {
    const token = `sess_${randomUUID()}`;
    const createdAt = nowSeconds();
    const expiresAt = createdAt + SESSION_TTL_SECONDS;
    await this.database.db.insert(authSessions).values({
      tokenHash: hashToken(token),
      userId: subject,
      expiresAt,
      revokedAt: null,
      createdAt,
    });
    return {
      subject,
      cookie: sessionCookie(token, expiresAt, options.secure ?? false),
      expiresAt,
    };
  }

  async getSessionFromRequest(
    request: Request,
  ): Promise<AuthSessionRecord | undefined> {
    const tokens = getSessionTokensFromRequest(request);
    for (const token of tokens) {
      const [row] = await this.database.db
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, hashToken(token)),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, nowSeconds()),
          ),
        )
        .limit(1);
      if (row) {
        return {
          id: row.tokenHash,
          token_hash: row.tokenHash,
          subject: row.userId,
          created_at: row.createdAt,
          expires_at: row.expiresAt,
        };
      }
    }
    return undefined;
  }

  async revokeSessionFromRequest(request: Request): Promise<boolean> {
    const tokenHashes = getSessionTokensFromRequest(request).map(hashToken);
    if (tokenHashes.length === 0) return false;

    const revoked = await this.database.db
      .update(authSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          inArray(authSessions.tokenHash, tokenHashes),
          isNull(authSessions.revokedAt),
        ),
      )
      .returning({ tokenHash: authSessions.tokenHash });
    return revoked.length > 0;
  }

  async revokeSessionsForSubject(subject: string): Promise<number> {
    const revoked = await this.database.db
      .update(authSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(eq(authSessions.userId, subject), isNull(authSessions.revokedAt)),
      )
      .returning({ tokenHash: authSessions.tokenHash });
    return revoked.length;
  }
}

/**
 * Legacy JSON session store retained only for immutable migration input and
 * standalone-store compatibility.
 */
export class AuthSessionStore implements AuthSessionPersistence {
  private readonly store: JsonFileStore<SessionStoreFile>;

  constructor(options: AuthSessionStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(
        options.storageDir,
        options.storeFile ?? DEFAULT_SESSION_STORE_FILE,
      ),
      parse: parseStoreFile,
      empty: (): SessionStoreFile => ({ sessions: [] }),
    });
  }

  async createSession(
    subject: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateAuthSessionResult> {
    const token = `sess_${randomUUID()}`;
    const createdAt = nowSeconds();
    const expiresAt = createdAt + SESSION_TTL_SECONDS;
    const record: AuthSessionRecord = {
      id: randomUUID(),
      token_hash: hashToken(token),
      subject,
      created_at: createdAt,
      expires_at: expiresAt,
    };

    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      store.sessions = store.sessions.filter(
        (session) => session.expires_at > createdAt,
      );
      store.sessions.push(record);
      await this.store.write(store);
    });

    return {
      subject,
      cookie: sessionCookie(token, expiresAt, options.secure ?? false),
      expiresAt,
    };
  }

  async listSessions(): Promise<AuthSessionRecord[]> {
    const store = await this.store.read();
    const now = nowSeconds();
    return store.sessions.filter((session) => session.expires_at > now);
  }

  async rebindSessionSubject(
    fromSubject: string,
    toSubject: string,
  ): Promise<number> {
    let updated = 0;
    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      for (const session of store.sessions) {
        if (session.subject === fromSubject) {
          session.subject = toSubject;
          updated += 1;
        }
      }
      if (updated > 0) {
        await this.store.write(store);
      }
    });
    return updated;
  }

  async getSessionFromRequest(
    request: Request,
  ): Promise<AuthSessionRecord | undefined> {
    const tokenHashes = getSessionTokensFromRequest(request).map(hashToken);
    if (tokenHashes.length === 0) return undefined;

    const now = nowSeconds();
    const store = await this.store.read();
    for (const tokenHash of tokenHashes) {
      const session = store.sessions.find(
        (candidate) =>
          candidate.token_hash === tokenHash && candidate.expires_at > now,
      );
      if (session) return session;
    }
    return undefined;
  }

  async revokeSessionFromRequest(request: Request): Promise<boolean> {
    const tokenHashes = getSessionTokensFromRequest(request).map(hashToken);
    if (tokenHashes.length === 0) return false;

    let revoked = false;
    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      const before = store.sessions.length;
      store.sessions = store.sessions.filter(
        (session) => !tokenHashes.includes(session.token_hash),
      );
      revoked = store.sessions.length !== before;
      if (revoked) {
        await this.store.write(store);
      }
    });

    return revoked;
  }

  async revokeSessionsForSubject(subject: string): Promise<number> {
    let revoked = 0;
    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      const before = store.sessions.length;
      store.sessions = store.sessions.filter(
        (session) => session.subject !== subject,
      );
      revoked = before - store.sessions.length;
      if (revoked > 0) {
        await this.store.write(store);
      }
    });
    return revoked;
  }
}

function getSessionTokensFromRequest(request: Request): string[] {
  const cookieHeader = request.headers.get("cookie");
  return [
    getCookie(cookieHeader, AUTH_SESSION_COOKIE),
    getCookie(cookieHeader, LEGACY_OPERATOR_SESSION_COOKIE),
  ].filter((token): token is string => token !== undefined);
}

function getCookie(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }
  return undefined;
}
