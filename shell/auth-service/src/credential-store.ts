import { sha256Base64Url } from "@brains/utils/hash";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { and, eq, exists, gt, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AuthRuntimeDB } from "./runtime-db";
import { passkeyCredentials, webauthnChallenges } from "./runtime-schema";
import { AuthIdentityStore } from "./identity-store";
import { AuthAuditStore } from "./audit-store";
import type { AuthRuntimeDatabase } from "./runtime-db";

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
  transports?: AuthenticatorTransportFuture[];
  credentialDeviceType?: string;
  credentialBackedUp: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface StoredPasskey {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  credentialDeviceType?: string;
  credentialBackedUp: boolean;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export class RuntimePasskeyStore {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async hasCredentials(): Promise<boolean> {
    return (await this.store().listPasskeys()).length > 0;
  }

  listCredentials(userId?: string): Promise<StoredPasskey[]> {
    return this.store().listPasskeys(userId);
  }

  getCredential(id: string): Promise<StoredPasskey | undefined> {
    return this.store().getPasskey(id);
  }

  async addCredential(input: AddPasskeyInput): Promise<void> {
    const credential = await this.store().addPasskey(input);
    await new AuthIdentityStore(this.database.db).ensureIdentity({
      userId: credential.userId,
      type: "passkey",
      subject: credential.id,
      label: "Passkey credential",
      verifiedAt: credential.createdAt,
      source: { kind: "provider", id: "webauthn" },
    });
    await new AuthAuditStore(this.database.db).append({
      action: "auth.passkey.registered",
      targetType: "passkey",
      targetId: credential.id,
      metadata: { userId: credential.userId },
    });
  }

  updateCredentialCounter(id: string, counter: number): Promise<void> {
    return this.store().updatePasskeyCounter(id, counter);
  }

  async saveRegistrationChallenge(
    challenge: string,
    subject: string,
  ): Promise<void> {
    await this.store().saveChallenge({
      challenge,
      kind: "registration",
      userId: subject,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
  }

  consumeRegistrationChallenge(
    challenge: string,
  ): Promise<StoredAuthChallenge | undefined> {
    return this.store().consumeChallenge(challenge, "registration");
  }

  async saveAuthenticationChallenge(challenge: string): Promise<void> {
    await this.store().saveChallenge({
      challenge,
      kind: "authentication",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
  }

  consumeAuthenticationChallenge(
    challenge: string,
  ): Promise<StoredAuthChallenge | undefined> {
    return this.store().consumeChallenge(challenge, "authentication");
  }

  private store(): AuthCredentialStore {
    return new AuthCredentialStore(this.database.db);
  }
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
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? input.createdAt ?? now,
      revokedAt: null,
    });
    const stored = await this.getPasskey(input.id);
    if (!stored) {
      throw new Error("Passkey credential was not stored");
    }
    return stored;
  }

  async getPasskey(id: string): Promise<StoredPasskey | undefined> {
    const credential = await this.getPasskeyRecord(id);
    return credential?.revokedAt === undefined ? credential : undefined;
  }

  async getPasskeyRecord(id: string): Promise<StoredPasskey | undefined> {
    const [row] = await this.db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.id, id))
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
          .orderBy(passkeyCredentials.createdAt, sql`rowid`)
      : await this.db
          .select()
          .from(passkeyCredentials)
          .where(isNull(passkeyCredentials.revokedAt))
          .orderBy(passkeyCredentials.createdAt, sql`rowid`);
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

  async revokeOwnedPasskeyIfAnotherRemains(
    id: string,
    userId: string,
  ): Promise<StoredPasskey> {
    const otherPasskey = alias(passkeyCredentials, "other_active_passkey");
    const revokedAt = Date.now();
    const [revoked] = await this.db
      .update(passkeyCredentials)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(
        and(
          eq(passkeyCredentials.id, id),
          eq(passkeyCredentials.userId, userId),
          isNull(passkeyCredentials.revokedAt),
          exists(
            this.db
              .select({ id: otherPasskey.id })
              .from(otherPasskey)
              .where(
                and(
                  eq(otherPasskey.userId, userId),
                  ne(otherPasskey.id, id),
                  isNull(otherPasskey.revokedAt),
                ),
              ),
          ),
        ),
      )
      .returning();
    if (revoked) return passkeyFromRow(revoked);

    const owned = await this.getPasskey(id);
    if (owned?.userId !== userId) {
      throw new Error("Passkey not found");
    }
    throw new Error("The last passkey cannot be revoked");
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
    ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
  };
}

function parseTransports(value: string): AuthenticatorTransportFuture[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter(
        (transport): transport is AuthenticatorTransportFuture =>
          typeof transport === "string",
      )
    : [];
}

function hashChallenge(challenge: string): string {
  return sha256Base64Url(challenge);
}
