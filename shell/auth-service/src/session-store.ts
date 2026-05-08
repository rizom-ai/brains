import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";

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

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function isOperatorSessionRecord(
  value: unknown,
): value is OperatorSessionRecord {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session["id"] === "string" &&
    typeof session["token_hash"] === "string" &&
    typeof session["subject"] === "string" &&
    typeof session["created_at"] === "number" &&
    typeof session["expires_at"] === "number"
  );
}

function parseStoreFile(value: unknown): SessionStoreFile {
  if (!value || typeof value !== "object") {
    return { sessions: [] };
  }

  const sessions = (value as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) {
    return { sessions: [] };
  }

  return {
    sessions: sessions.filter(isOperatorSessionRecord),
  };
}

function sessionCookie(token: string, expiresAt: number): string {
  return `${OPERATOR_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(
    0,
    expiresAt - nowSeconds(),
  )}`;
}

export function clearOperatorSessionCookie(): string {
  return `${OPERATOR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export class OperatorSessionStore {
  private readonly storeFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: OperatorSessionStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_SESSION_STORE_FILE,
    );
  }

  async createSession(subject: string): Promise<CreateOperatorSessionResult> {
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

    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      store.sessions = store.sessions.filter(
        (session) => session.expires_at > createdAt,
      );
      store.sessions.push(record);
      await this.writeStore(store);
    });

    return {
      subject,
      cookie: sessionCookie(token, expiresAt),
      expiresAt,
    };
  }

  async getSessionFromRequest(
    request: Request,
  ): Promise<OperatorSessionRecord | undefined> {
    const token = getSessionTokenFromRequest(request);
    if (!token) return undefined;

    const tokenHash = hashToken(token);
    const now = nowSeconds();
    const store = await this.readStore();
    return store.sessions.find(
      (session) => session.token_hash === tokenHash && session.expires_at > now,
    );
  }

  async revokeSessionFromRequest(request: Request): Promise<boolean> {
    const token = getSessionTokenFromRequest(request);
    if (!token) return false;

    const tokenHash = hashToken(token);
    let revoked = false;
    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      const before = store.sessions.length;
      store.sessions = store.sessions.filter(
        (session) => session.token_hash !== tokenHash,
      );
      revoked = store.sessions.length !== before;
      if (revoked) {
        await this.writeStore(store);
      }
    });

    return revoked;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async readStore(): Promise<SessionStoreFile> {
    try {
      return parseStoreFile(
        JSON.parse(await readFile(this.storeFile, "utf8")) as unknown,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { sessions: [] };
      }
      throw error;
    }
  }

  private async writeStore(store: SessionStoreFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
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
