import { createHash } from "node:crypto";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AuthRuntimeDB } from "./runtime-db";
import type {
  StoredPasskeyCredential,
  StoredWebAuthnChallenge,
} from "./passkey-store";
import { passkeyCredentials, webauthnChallenges } from "./runtime-schema";
import { AuthUserStore } from "./user-store";
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
const AUTHENTICATION_CHALLENGE_SUBJECT = "passkey-authentication";

export class RuntimePasskeyStore {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async hasCredentials(): Promise<boolean> {
    return (await this.store().listPasskeys()).length > 0;
  }

  async listCredentials(): Promise<StoredPasskeyCredential[]> {
    return (await this.store().listPasskeys()).map(toLegacyPasskeyShape);
  }

  async getCredential(
    id: string,
  ): Promise<StoredPasskeyCredential | undefined> {
    const credential = await this.store().getPasskey(id);
    return credential ? toLegacyPasskeyShape(credential) : undefined;
  }

  async addCredential(credential: StoredPasskeyCredential): Promise<void> {
    await this.store().addPasskey({
      id: credential.id,
      userId: credential.subject,
      publicKey: credential.public_key,
      counter: credential.counter,
      ...(credential.transports ? { transports: credential.transports } : {}),
      credentialDeviceType: credential.credential_device_type,
      credentialBackedUp: credential.credential_backed_up,
      createdAt: timestampToMilliseconds(credential.created_at),
      updatedAt: timestampToMilliseconds(credential.updated_at),
    });
    await new AuthUserStore(this.database.db).ensureIdentity({
      userId: credential.subject,
      type: "passkey",
      subject: credential.id,
      label: "Passkey credential",
      verifiedAt: timestampToMilliseconds(credential.created_at),
    });
    await new AuthAuditStore(this.database.db).append({
      action: "auth.passkey.registered",
      targetType: "passkey",
      targetId: credential.id,
      metadata: { userId: credential.subject },
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

  async consumeRegistrationChallenge(
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    const stored = await this.store().consumeChallenge(
      challenge,
      "registration",
    );
    return stored ? toLegacyChallengeShape(challenge, stored) : undefined;
  }

  async saveAuthenticationChallenge(challenge: string): Promise<void> {
    await this.store().saveChallenge({
      challenge,
      kind: "authentication",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
  }

  async consumeAuthenticationChallenge(
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    const stored = await this.store().consumeChallenge(
      challenge,
      "authentication",
    );
    return stored
      ? toLegacyChallengeShape(
          challenge,
          stored,
          AUTHENTICATION_CHALLENGE_SUBJECT,
        )
      : undefined;
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

function toLegacyPasskeyShape(
  credential: StoredPasskey,
): StoredPasskeyCredential {
  return {
    id: credential.id,
    public_key: credential.publicKey,
    counter: credential.counter,
    ...(credential.transports ? { transports: credential.transports } : {}),
    subject: credential.userId,
    user_name: "",
    credential_device_type: credential.credentialDeviceType ?? "unknown",
    credential_backed_up: credential.credentialBackedUp,
    created_at: Math.floor(credential.createdAt / 1000),
    updated_at: Math.floor(credential.updatedAt / 1000),
  };
}

function toLegacyChallengeShape(
  challenge: string,
  stored: StoredAuthChallenge,
  fallbackSubject = "",
): StoredWebAuthnChallenge {
  return {
    challenge,
    subject: stored.userId ?? fallbackSubject,
    created_at: Math.floor(stored.createdAt / 1000),
    expires_at: Math.floor(stored.expiresAt / 1000),
  };
}

function timestampToMilliseconds(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
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
  return createHash("sha256").update(challenge).digest("base64url");
}
