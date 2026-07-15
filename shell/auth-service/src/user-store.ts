import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authPeople,
  authUsers,
  type AuthIdentity,
  type AuthPerson,
  type AuthUser,
} from "./runtime-schema";

export type AuthUserRole = AuthUser["role"];
export type AuthUserStatus = AuthUser["status"];
export type AuthIdentityType = AuthIdentity["type"];

export interface CreateAuthPersonInput {
  displayName: string;
  profileEntityId?: string;
}

export interface CreateAuthUserInput {
  displayName: string;
  personId?: string;
  role?: AuthUserRole;
  status?: AuthUserStatus;
  canonicalId?: string;
}

export interface AttachAuthIdentityInput {
  userId: string;
  type: AuthIdentityType;
  subject: string;
  issuer?: string;
  deliverySubject?: string;
  label?: string;
  verifiedAt?: number;
}

export interface ResolveAuthIdentityInput {
  type: AuthIdentityType;
  subject: string;
  issuer?: string;
}

export type AuthIdentityLookupResult =
  | { state: "resolved"; user: AuthUser }
  | { state: "denied" }
  | { state: "unbound" };

export class AuthUserStore {
  private readonly db: AuthRuntimeDB;
  private firstAnchorInitialization: Promise<AuthUser> | undefined;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async ensureFirstAnchorUser(
    input: { displayName?: string } = {},
  ): Promise<AuthUser> {
    if (this.firstAnchorInitialization) {
      return this.firstAnchorInitialization;
    }

    const initialization = this.ensureFirstAnchorUserTransaction(input);
    this.firstAnchorInitialization = initialization;
    try {
      return await initialization;
    } finally {
      if (this.firstAnchorInitialization === initialization) {
        this.firstAnchorInitialization = undefined;
      }
    }
  }

  private ensureFirstAnchorUserTransaction(input: {
    displayName?: string;
  }): Promise<AuthUser> {
    return this.db.transaction(async (tx) => {
      const [existingAnchor] = await tx
        .select()
        .from(authUsers)
        .where(
          and(eq(authUsers.role, "anchor"), eq(authUsers.status, "active")),
        )
        .orderBy(authUsers.createdAt)
        .limit(1);
      if (existingAnchor) {
        return existingAnchor;
      }

      const [existingUser] = await tx.select().from(authUsers).limit(1);
      if (existingUser) {
        throw new Error(
          "Auth users already exist but no active anchor user was found",
        );
      }

      const now = Date.now();
      const id = createPrefixedId("usr");
      const personId = createPrefixedId("prsn");
      const displayName = input.displayName ?? "Anchor";
      await tx.insert(authPeople).values({
        id: personId,
        displayName,
        profileEntityId: null,
        createdAt: now,
        updatedAt: now,
      });
      const user = {
        id,
        personId,
        displayName,
        role: "anchor",
        status: "active",
        canonicalId: canonicalIdForUserId(id),
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authUsers.$inferInsert;
      await tx.insert(authUsers).values(user);
      return user;
    });
  }

  async createPerson(input: CreateAuthPersonInput): Promise<AuthPerson> {
    const now = Date.now();
    const person = {
      id: createPrefixedId("prsn"),
      displayName: input.displayName,
      profileEntityId: input.profileEntityId ?? null,
      createdAt: now,
      updatedAt: now,
    } satisfies typeof authPeople.$inferInsert;
    await this.db.insert(authPeople).values(person);
    return person;
  }

  async getPerson(personId: string): Promise<AuthPerson | undefined> {
    const [person] = await this.db
      .select()
      .from(authPeople)
      .where(eq(authPeople.id, personId))
      .limit(1);
    return person;
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUser> {
    return this.db.transaction(async (tx) => {
      const now = Date.now();
      const id = createPrefixedId("usr");
      const personId = input.personId ?? createPrefixedId("prsn");

      if (input.personId) {
        const [person] = await tx
          .select({ id: authPeople.id })
          .from(authPeople)
          .where(eq(authPeople.id, input.personId))
          .limit(1);
        if (!person) {
          throw new Error(`Auth person not found: ${input.personId}`);
        }
      } else {
        await tx.insert(authPeople).values({
          id: personId,
          displayName: input.displayName,
          profileEntityId: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      const user = {
        id,
        personId,
        displayName: input.displayName,
        role: input.role ?? "public",
        status: input.status ?? "active",
        canonicalId: input.canonicalId ?? canonicalIdForUserId(id),
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authUsers.$inferInsert;

      await tx.insert(authUsers).values(user);
      return user;
    });
  }

  async listUsers(): Promise<AuthUser[]> {
    return this.db.select().from(authUsers).orderBy(authUsers.createdAt);
  }

  async getUser(userId: string): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return user;
  }

  async updateUserRole(userId: string, role: AuthUserRole): Promise<AuthUser> {
    await this.requireUser(userId);

    await this.db
      .update(authUsers)
      .set({ role, updatedAt: Date.now() })
      .where(
        and(
          eq(authUsers.id, userId),
          sql`NOT (
            ${authUsers.role} = 'anchor'
            AND ${authUsers.status} = 'active'
            AND ${role} <> 'anchor'
            AND NOT EXISTS (
              SELECT 1 FROM ${authUsers} AS other
              WHERE other.id <> ${userId}
                AND other.role = 'anchor'
                AND other.status = 'active'
            )
          )`,
        ),
      );

    const updated = await this.requireUser(userId);
    if (updated.role !== role) {
      throw new Error("Cannot remove the last active anchor user");
    }
    return updated;
  }

  async updateUserStatus(
    userId: string,
    status: AuthUserStatus,
  ): Promise<AuthUser> {
    await this.requireUser(userId);

    await this.db
      .update(authUsers)
      .set({ status, updatedAt: Date.now() })
      .where(
        and(
          eq(authUsers.id, userId),
          sql`NOT (
            ${authUsers.role} = 'anchor'
            AND ${authUsers.status} = 'active'
            AND ${status} <> 'active'
            AND NOT EXISTS (
              SELECT 1 FROM ${authUsers} AS other
              WHERE other.id <> ${userId}
                AND other.role = 'anchor'
                AND other.status = 'active'
            )
          )`,
        ),
      );

    const updated = await this.requireUser(userId);
    if (updated.status !== status) {
      throw new Error("Cannot remove the last active anchor user");
    }
    return updated;
  }

  async ensureIdentity(
    input: AttachAuthIdentityInput,
  ): Promise<{ identity: AuthIdentity; created: boolean }> {
    await this.requireUser(input.userId);
    const identityKeyHash = hashIdentityKey(normalizeIdentityKey(input));
    const [existing] = await this.db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          isNull(authIdentities.revokedAt),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.userId !== input.userId) {
        throw new Error("Auth identity is already attached to another user");
      }
      return { identity: existing, created: false };
    }

    return {
      identity: await this.attachIdentity(input),
      created: true,
    };
  }

  async attachIdentity(input: AttachAuthIdentityInput): Promise<AuthIdentity> {
    const user = await this.requireUser(input.userId);

    const identity = {
      id: createPrefixedId("aid"),
      personId: user.personId,
      userId: input.userId,
      type: input.type,
      issuer: input.issuer ?? null,
      identityKeyHash: hashIdentityKey(normalizeIdentityKey(input)),
      deliverySubject: input.deliverySubject ?? null,
      label: input.label ?? null,
      verifiedAt: input.verifiedAt ?? null,
      revokedAt: null,
      createdAt: Date.now(),
    } satisfies typeof authIdentities.$inferInsert;

    await this.db.insert(authIdentities).values(identity);
    return identity;
  }

  async listIdentities(userId: string): Promise<AuthIdentity[]> {
    const user = await this.requireUser(userId);
    return this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.personId, user.personId))
      .orderBy(authIdentities.createdAt);
  }

  async detachIdentityBySubject(
    input: ResolveAuthIdentityInput & { userId: string },
  ): Promise<AuthIdentity | undefined> {
    const user = await this.requireUser(input.userId);
    const identityKeyHash = hashIdentityKey(normalizeIdentityKey(input));
    const [identity] = await this.db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          eq(authIdentities.personId, user.personId),
          isNull(authIdentities.revokedAt),
        ),
      )
      .limit(1);
    return identity ? this.detachIdentity(identity.id) : undefined;
  }

  async detachIdentity(identityId: string): Promise<AuthIdentity> {
    const [identity] = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.id, identityId))
      .limit(1);
    if (!identity) {
      throw new Error(`Auth identity not found: ${identityId}`);
    }
    if (identity.revokedAt !== null) {
      return identity;
    }

    const revokedAt = Date.now();
    await this.db
      .update(authIdentities)
      .set({ revokedAt })
      .where(eq(authIdentities.id, identityId));
    return { ...identity, revokedAt };
  }

  async resolveIdentity(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthUser | undefined> {
    const result = await this.resolveIdentityAccess(input);
    return result.state === "resolved" ? result.user : undefined;
  }

  async resolveIdentityAccess(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthIdentityLookupResult> {
    return this.resolveIdentityHashAccess(
      hashIdentityKey(normalizeIdentityKey(input)),
    );
  }

  async resolveIdentityHashAccess(
    identityKeyHash: string,
  ): Promise<AuthIdentityLookupResult> {
    const [row] = await this.db
      .select({ user: authUsers })
      .from(authIdentities)
      .innerJoin(authUsers, eq(authIdentities.personId, authUsers.personId))
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          isNull(authIdentities.revokedAt),
          isNotNull(authIdentities.verifiedAt),
          eq(authUsers.status, "active"),
        ),
      )
      .limit(1);

    if (row) {
      return { state: "resolved", user: row.user };
    }

    const [knownBinding] = await this.db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.identityKeyHash, identityKeyHash))
      .limit(1);
    return knownBinding ? { state: "denied" } : { state: "unbound" };
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`Auth user not found: ${userId}`);
    }
    return user;
  }
}

export function normalizeIdentityKey(input: ResolveAuthIdentityInput): string {
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("Identity subject is required");
  }

  switch (input.type) {
    case "email":
      return `email:${subject.toLowerCase()}`;
    case "oauth": {
      const issuer = input.issuer?.trim();
      if (!issuer) {
        throw new Error("OAuth identity issuer is required");
      }
      return `oauth:${issuer}:${subject}`;
    }
    default:
      return `${input.type}:${subject}`;
  }
}

export function hashIdentityKey(identityKey: string): string {
  return createHash("sha256").update(identityKey).digest("hex");
}

function canonicalIdForUserId(userId: string): string {
  return `user:${userId.slice("usr_".length)}`;
}
