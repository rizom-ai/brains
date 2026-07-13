import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { JsonFileStore } from "./json-file-store";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";
import { join } from "node:path";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { operatorSessions } from "./runtime-schema";

const DEFAULT_SESSION_STORE_FILE = "oauth-sessions.json";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const OPERATOR_SESSION_COOKIE = "brains_operator_session";

export interface OperatorSessionRecord {
  id: string;
  token_hash: string;
  subject: string;
  created_at: number;
  expires_at: number;
}

interface SessionStoreFile {
  sessions: OperatorSessionRecord[];
}

export interface CreateOperatorSessionResult {
  subject: string;
  cookie: string;
  expiresAt: number;
}

export interface OperatorSessionStoreOptions {
  storageDir: string;
  storeFile?: string;
}

export interface OperatorSessionPersistence {
  createSession(
    subject: string,
    options?: { secure?: boolean },
  ): Promise<CreateOperatorSessionResult>;
  getSessionFromRequest(
    request: Request,
  ): Promise<OperatorSessionRecord | undefined>;
  revokeSessionFromRequest(request: Request): Promise<boolean>;
  revokeSessionsForSubject(subject: string): Promise<number>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

const operatorSessionRecordSchema = z.looseObject({
  id: z.string(),
  token_hash: z.string(),
  subject: z.string(),
  created_at: z.number(),
  expires_at: z.number(),
});

const sessionStoreFileSchema = z.looseObject({
  sessions: z.array(operatorSessionRecordSchema).optional(),
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
  return `${OPERATOR_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(
    0,
    expiresAt - nowSeconds(),
  )}${secure ? "; Secure" : ""}`;
}

export function clearOperatorSessionCookie(secure = false): string {
  return `${OPERATOR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    secure ? "; Secure" : ""
  }`;
}

export class RuntimeOperatorSessionStore implements OperatorSessionPersistence {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async importSession(
    session: OperatorSessionRecord,
    userId: string,
  ): Promise<boolean> {
    const inserted = await this.database.db
      .insert(operatorSessions)
      .values({
        tokenHash: session.token_hash,
        userId,
        expiresAt: session.expires_at,
        revokedAt: null,
        createdAt: session.created_at,
      })
      .onConflictDoNothing()
      .returning({ tokenHash: operatorSessions.tokenHash });
    return inserted.length > 0;
  }

  async createSession(
    subject: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateOperatorSessionResult> {
    const token = `oss_${randomUUID()}`;
    const createdAt = nowSeconds();
    const expiresAt = createdAt + SESSION_TTL_SECONDS;
    await this.database.db.insert(operatorSessions).values({
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
  ): Promise<OperatorSessionRecord | undefined> {
    const token = getSessionTokenFromRequest(request);
    if (!token) return undefined;

    const [row] = await this.database.db
      .select()
      .from(operatorSessions)
      .where(
        and(
          eq(operatorSessions.tokenHash, hashToken(token)),
          isNull(operatorSessions.revokedAt),
          gt(operatorSessions.expiresAt, nowSeconds()),
        ),
      )
      .limit(1);
    return row
      ? {
          id: row.tokenHash,
          token_hash: row.tokenHash,
          subject: row.userId,
          created_at: row.createdAt,
          expires_at: row.expiresAt,
        }
      : undefined;
  }

  async revokeSessionFromRequest(request: Request): Promise<boolean> {
    const token = getSessionTokenFromRequest(request);
    if (!token) return false;

    const revoked = await this.database.db
      .update(operatorSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          eq(operatorSessions.tokenHash, hashToken(token)),
          isNull(operatorSessions.revokedAt),
        ),
      )
      .returning({ tokenHash: operatorSessions.tokenHash });
    return revoked.length > 0;
  }

  async revokeSessionsForSubject(subject: string): Promise<number> {
    const revoked = await this.database.db
      .update(operatorSessions)
      .set({ revokedAt: nowSeconds() })
      .where(
        and(
          eq(operatorSessions.userId, subject),
          isNull(operatorSessions.revokedAt),
        ),
      )
      .returning({ tokenHash: operatorSessions.tokenHash });
    return revoked.length;
  }
}

export class OperatorSessionStore implements OperatorSessionPersistence {
  private readonly store: JsonFileStore<SessionStoreFile>;

  constructor(options: OperatorSessionStoreOptions) {
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
  ): Promise<CreateOperatorSessionResult> {
    const token = `oss_${randomUUID()}`;
    const createdAt = nowSeconds();
    const expiresAt = createdAt + SESSION_TTL_SECONDS;
    const record: OperatorSessionRecord = {
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

  async listSessions(): Promise<OperatorSessionRecord[]> {
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
  ): Promise<OperatorSessionRecord | undefined> {
    const token = getSessionTokenFromRequest(request);
    if (!token) return undefined;

    const tokenHash = hashToken(token);
    const now = nowSeconds();
    const store = await this.store.read();
    return store.sessions.find(
      (session) => session.token_hash === tokenHash && session.expires_at > now,
    );
  }

  async revokeSessionFromRequest(request: Request): Promise<boolean> {
    const token = getSessionTokenFromRequest(request);
    if (!token) return false;

    const tokenHash = hashToken(token);
    let revoked = false;
    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      const before = store.sessions.length;
      store.sessions = store.sessions.filter(
        (session) => session.token_hash !== tokenHash,
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

function getSessionTokenFromRequest(request: Request): string | undefined {
  return getCookie(request.headers.get("cookie"), OPERATOR_SESSION_COOKIE);
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
