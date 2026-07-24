import { randomUUID } from "node:crypto";
import { sha256Base64Url } from "@brains/utils/hash";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { nowSeconds } from "@brains/utils/date";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { authSessions } from "./runtime-schema";

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

export interface CreateAuthSessionResult {
  subject: string;
  cookie: string;
  expiresAt: number;
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
  return sha256Base64Url(token);
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

  async listActiveSessionsForSubject(
    subject: string,
  ): Promise<AuthSessionRecord[]> {
    const rows = await this.database.db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, subject),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, nowSeconds()),
        ),
      )
      .orderBy(authSessions.createdAt, sql`rowid`);
    return rows.map((row) => ({
      id: row.tokenHash,
      token_hash: row.tokenHash,
      subject: row.userId,
      created_at: row.createdAt,
      expires_at: row.expiresAt,
    }));
  }

  async revokeActiveSessionForSubject(
    subject: string,
    sessionId: string,
  ): Promise<boolean> {
    const revoked = await this.database.db
      .update(authSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          eq(authSessions.userId, subject),
          eq(authSessions.tokenHash, sessionId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, nowSeconds()),
        ),
      )
      .returning({ tokenHash: authSessions.tokenHash });
    return revoked.length === 1;
  }

  async revokeOtherActiveSessionsForSubject(
    subject: string,
    currentSessionId: string,
  ): Promise<number> {
    const revoked = await this.database.db
      .update(authSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          eq(authSessions.userId, subject),
          ne(authSessions.tokenHash, currentSessionId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, nowSeconds()),
        ),
      )
      .returning({ tokenHash: authSessions.tokenHash });
    return revoked.length;
  }

  async revokeActiveSessionsForSubject(subject: string): Promise<number> {
    const revoked = await this.database.db
      .update(authSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          eq(authSessions.userId, subject),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, nowSeconds()),
        ),
      )
      .returning({ tokenHash: authSessions.tokenHash });
    return revoked.length;
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
