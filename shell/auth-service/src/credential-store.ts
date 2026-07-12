import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AuthRuntimeDB } from "./runtime-db";
import { passkeyCredentials, webauthnChallenges } from "./runtime-schema";

export type WebAuthnChallengeKind = "registration" | "authentication";

export interface SaveWebAuthnChallengeInput {
  challenge: string;
  kind: WebAuthnChallengeKind;
  userId?: string;
  expiresAt: number;
}

export interface StoredAuthChallenge {
  challengeHash: string;
  userId: string | undefined;
  kind: WebAuthnChallengeKind;
  expiresAt: number;
  consumedAt: number | undefined;
  createdAt: number;
}

export interface AddPasskeyInput {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  credentialDeviceType?: string;
  credentialBackedUp: boolean;
}

export interface StoredPasskey {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  credentialDeviceType?: string;
  credentialBackedUp: boolean;
  createdAt: number;
  updatedAt: number;
}

export class AuthCredentialStore {
  private readonly db: AuthRuntimeDB;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async addPasskey(input: AddPasskeyInput): Promise<StoredPasskey> {
    const now = Date.now();
    await this.db.insert(passkeyCredentials).values({
      id: input.id,
      userId: input.userId,
      publicKey: input.publicKey,
      counter: input.counter,
      transportsJson: input.transports
        ? JSON.stringify(input.transports)
        : null,
      credentialDeviceType: input.credentialDeviceType ?? null,
      credentialBackedUp: input.credentialBackedUp,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    });
    const stored = await this.getPasskey(input.id);
    if (!stored) {
      throw new Error("Passkey credential was not stored");
    }
    return stored;
  }

  async getPasskey(id: string): Promise<StoredPasskey | undefined> {
    const [row] = await this.db
      .select()
      .from(passkeyCredentials)
      .where(
        and(
          eq(passkeyCredentials.id, id),
          isNull(passkeyCredentials.revokedAt),
        ),
      )
      .limit(1);
    return row ? passkeyFromRow(row) : undefined;
  }

  async listPasskeys(userId?: string): Promise<StoredPasskey[]> {
    const rows = userId
      ? await this.db
          .select()
          .from(passkeyCredentials)
          .where(
            and(
              eq(passkeyCredentials.userId, userId),
              isNull(passkeyCredentials.revokedAt),
            ),
          )
      : await this.db
          .select()
          .from(passkeyCredentials)
          .where(isNull(passkeyCredentials.revokedAt));
    return rows.map(passkeyFromRow);
  }

  async updatePasskeyCounter(id: string, counter: number): Promise<void> {
    const rows = await this.db
      .update(passkeyCredentials)
      .set({ counter, updatedAt: Date.now() })
      .where(
        and(
          eq(passkeyCredentials.id, id),
          isNull(passkeyCredentials.revokedAt),
        ),
      )
      .returning({ id: passkeyCredentials.id });
    if (rows.length === 0) {
      throw new Error("Passkey credential not found");
    }
  }

  async revokePasskey(id: string): Promise<void> {
    await this.db
      .update(passkeyCredentials)
      .set({ revokedAt: Date.now(), updatedAt: Date.now() })
      .where(
        and(
          eq(passkeyCredentials.id, id),
          isNull(passkeyCredentials.revokedAt),
        ),
      );
  }

  async saveChallenge(input: SaveWebAuthnChallengeInput): Promise<void> {
    await this.db.insert(webauthnChallenges).values({
      challengeHash: hashChallenge(input.challenge),
      userId: input.userId ?? null,
      kind: input.kind,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: Date.now(),
    });
  }

  async consumeChallenge(
    challenge: string,
    kind: WebAuthnChallengeKind,
    now: number = Date.now(),
  ): Promise<StoredAuthChallenge | undefined> {
    const [row] = await this.db
      .update(webauthnChallenges)
      .set({ consumedAt: now })
      .where(
        and(
          eq(webauthnChallenges.challengeHash, hashChallenge(challenge)),
          eq(webauthnChallenges.kind, kind),
          isNull(webauthnChallenges.consumedAt),
          gt(webauthnChallenges.expiresAt, now),
        ),
      )
      .returning();
    return row
      ? {
          challengeHash: row.challengeHash,
          userId: row.userId ?? undefined,
          kind: row.kind,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt ?? undefined,
          createdAt: row.createdAt,
        }
      : undefined;
  }
}

function passkeyFromRow(
  row: typeof passkeyCredentials.$inferSelect,
): StoredPasskey {
  return {
    id: row.id,
    userId: row.userId,
    publicKey: row.publicKey,
    counter: row.counter,
    ...(row.transportsJson
      ? { transports: parseTransports(row.transportsJson) }
      : {}),
    ...(row.credentialDeviceType
      ? { credentialDeviceType: row.credentialDeviceType }
      : {}),
    credentialBackedUp: row.credentialBackedUp,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseTransports(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter(
        (transport): transport is string => typeof transport === "string",
      )
    : [];
}

function hashChallenge(challenge: string): string {
  return createHash("sha256").update(challenge).digest("base64url");
}
