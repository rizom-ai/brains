import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthAppPasswordAccess } from "@brains/contracts";
import { nowSeconds } from "@brains/utils/date";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { authAppPasswords } from "./runtime-schema";
import { hashToken } from "./token-hash";

export const APP_PASSWORD_TTL_SECONDS: number = 365 * 24 * 60 * 60;
const APP_PASSWORD_USERNAME_PREFIX = "dav-";

/** The username a client sends with an app password. */
export function appPasswordUsername(id: string): string {
  return `${APP_PASSWORD_USERNAME_PREFIX}${id}`;
}

export interface AppPasswordRecord {
  id: string;
  userId: string;
  label: string;
  access: AuthAppPasswordAccess;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

export interface CreateAppPasswordInput {
  userId: string;
  label: string;
  access: AuthAppPasswordAccess;
}

/** The only moment the password exists in the clear. */
export interface IssuedAppPassword {
  username: string;
  password: string;
  record: AppPasswordRecord;
}

export interface ResolvedAppPassword {
  record: AppPasswordRecord;
  /** True the first time this password authenticates a request. */
  firstUse: boolean;
}

export interface AppPasswordPersistence {
  create(input: CreateAppPasswordInput): Promise<IssuedAppPassword>;
  /** A person's passwords that are not revoked, newest first; expired ones included. */
  list(userId: string): Promise<AppPasswordRecord[]>;
  revoke(userId: string, id: string): Promise<boolean>;
  resolve(
    username: string,
    password: string,
  ): Promise<ResolvedAppPassword | undefined>;
}

/**
 * Usernames and passwords for clients that can only send HTTP Basic
 * credentials. Both halves are generated, so the password is never one a
 * person chose and only its hash is stored.
 */
export class RuntimeAppPasswordStore implements AppPasswordPersistence {
  private readonly database: AuthRuntimeDatabase;
  private readonly now: () => number;

  constructor(database: AuthRuntimeDatabase, now: () => number = nowSeconds) {
    this.database = database;
    this.now = now;
  }

  async create(input: CreateAppPasswordInput): Promise<IssuedAppPassword> {
    const password = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const record: AppPasswordRecord = {
      id: randomBytes(9).toString("base64url"),
      userId: input.userId,
      label: input.label,
      access: input.access,
      createdAt,
      expiresAt: createdAt + APP_PASSWORD_TTL_SECONDS,
    };
    await this.database.db
      .insert(authAppPasswords)
      .values({ ...record, secretHash: hashToken(password) });
    return {
      username: appPasswordUsername(record.id),
      password,
      record,
    };
  }

  async list(userId: string): Promise<AppPasswordRecord[]> {
    const rows = await this.database.db
      .select()
      .from(authAppPasswords)
      .where(
        and(
          eq(authAppPasswords.userId, userId),
          isNull(authAppPasswords.revokedAt),
        ),
      )
      .orderBy(desc(authAppPasswords.createdAt), desc(authAppPasswords.id));
    return rows.map(recordFromRow);
  }

  async revoke(userId: string, id: string): Promise<boolean> {
    const revoked = await this.database.db
      .update(authAppPasswords)
      .set({ revokedAt: this.now() })
      .where(
        and(
          eq(authAppPasswords.id, id),
          eq(authAppPasswords.userId, userId),
          isNull(authAppPasswords.revokedAt),
        ),
      )
      .returning({ id: authAppPasswords.id });
    return revoked.length > 0;
  }

  async resolve(
    username: string,
    password: string,
  ): Promise<ResolvedAppPassword | undefined> {
    if (!username.startsWith(APP_PASSWORD_USERNAME_PREFIX)) return undefined;
    const id = username.slice(APP_PASSWORD_USERNAME_PREFIX.length);

    const [row] = await this.database.db
      .select()
      .from(authAppPasswords)
      .where(eq(authAppPasswords.id, id))
      .limit(1);
    if (!row) return undefined;
    const now = this.now();
    if (
      row.revokedAt !== null ||
      row.expiresAt <= now ||
      !sameHash(row.secretHash, hashToken(password))
    ) {
      return undefined;
    }

    await this.database.db
      .update(authAppPasswords)
      .set({ lastUsedAt: now })
      .where(eq(authAppPasswords.id, id));
    return {
      record: { ...recordFromRow(row), lastUsedAt: now },
      firstUse: row.lastUsedAt === null,
    };
  }
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function recordFromRow(
  row: typeof authAppPasswords.$inferSelect,
): AppPasswordRecord {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    access: row.access,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.lastUsedAt !== null ? { lastUsedAt: row.lastUsedAt } : {}),
  };
}
