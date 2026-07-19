import { sha256Hex } from "@brains/utils/hash";
import {
  and,
  eq,
  exists,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authBrainAnchor,
  authIdentities,
  authIdentityEvidence,
  authPeople,
  authUsers,
  type AuthBrainAnchor,
  type AuthIdentity,
  type AuthIdentityEvidence,
  type AuthPerson,
  type AuthUser,
} from "./runtime-schema";

export type AuthUserRole = AuthUser["role"];
export type AuthUserStatus = AuthUser["status"];
export type AuthIdentityType = AuthIdentity["type"];
export type AuthIdentitySourceKind = AuthIdentityEvidence["sourceKind"];
export type AuthIdentityVisibility = AuthIdentity["visibility"];

export interface AuthIdentityRecord extends AuthIdentity {
  evidence: AuthIdentityEvidence[];
  verifiedAt: number | null;
}

export interface CreateAuthPersonInput {
  displayName: string;
  profileEntityId?: string;
}

export interface UpdateBrainAnchorInput {
  kind: AuthBrainAnchor["kind"];
  userId?: string;
  displayName?: string;
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
  visibility?: AuthIdentityVisibility;
  verifiedAt?: number;
  source?: { kind: AuthIdentitySourceKind; id?: string };
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
  private firstAdminInitialization: Promise<AuthUser> | undefined;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async ensureFirstAdminUser(
    input: { displayName?: string } = {},
  ): Promise<AuthUser> {
    if (this.firstAdminInitialization) return this.firstAdminInitialization;

    const initialization = this.ensureFirstAdminUserTransaction(input);
    this.firstAdminInitialization = initialization;
    try {
      return await initialization;
    } finally {
      if (this.firstAdminInitialization === initialization) {
        this.firstAdminInitialization = undefined;
      }
    }
  }

  private ensureFirstAdminUserTransaction(input: {
    displayName?: string;
  }): Promise<AuthUser> {
    return this.db.transaction(async (tx) => {
      const [existingAdmin] = await tx
        .select()
        .from(authUsers)
        .where(and(eq(authUsers.role, "admin"), eq(authUsers.status, "active")))
        .orderBy(authUsers.createdAt)
        .limit(1);
      if (existingAdmin) {
        const [existingAnchor] = await tx
          .select()
          .from(authBrainAnchor)
          .limit(1);
        if (!existingAnchor) {
          const [person] = await tx
            .select()
            .from(authPeople)
            .where(eq(authPeople.id, existingAdmin.personId))
            .limit(1);
          if (!person) {
            throw new Error(`Auth person not found: ${existingAdmin.personId}`);
          }
          await tx.insert(authBrainAnchor).values({
            id: "brain",
            kind: "person",
            subjectId: person.id,
            displayName: person.displayName,
            profileEntityId: person.profileEntityId,
            createdAt: existingAdmin.createdAt,
            updatedAt: existingAdmin.updatedAt,
          });
        }
        return existingAdmin;
      }

      const [existingUser] = await tx.select().from(authUsers).limit(1);
      if (existingUser) {
        throw new Error(
          "Auth users already exist but no active admin user was found",
        );
      }

      const now = Date.now();
      const id = createPrefixedId("usr");
      const personId = createPrefixedId("prsn");
      const displayName = input.displayName ?? "Admin";
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
        role: "admin",
        status: "active",
        canonicalId: canonicalIdForUserId(id),
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authUsers.$inferInsert;
      await tx.insert(authUsers).values(user);
      await tx.insert(authBrainAnchor).values({
        id: "brain",
        kind: "person",
        subjectId: personId,
        displayName,
        profileEntityId: null,
        createdAt: now,
        updatedAt: now,
      });
      return user;
    });
  }

  async getBrainAnchor(): Promise<AuthBrainAnchor | undefined> {
    const [anchor] = await this.db.select().from(authBrainAnchor).limit(1);
    return anchor;
  }

  async updateBrainAnchor(
    input: UpdateBrainAnchorInput,
  ): Promise<AuthBrainAnchor> {
    const current = await this.getBrainAnchor();
    const personAnchorUserId =
      input.kind === "person" ? input.userId : undefined;
    const now = Date.now();
    let subjectId: string;
    let displayName: string;
    let profileEntityId: string | null;

    if (input.kind === "person") {
      if (!personAnchorUserId) {
        throw new Error("Select an admin as the person anchor");
      }
      const user = await this.requireUser(personAnchorUserId);
      if (user.role !== "admin" || user.status !== "active") {
        throw new Error("The person anchor must be an active admin");
      }
      const person = await this.getPerson(user.personId);
      if (!person) throw new Error(`Auth person not found: ${user.personId}`);
      subjectId = person.id;
      displayName = person.displayName;
      profileEntityId = person.profileEntityId;
    } else {
      displayName = input.displayName?.trim() ?? "";
      if (!displayName) throw new Error("Collective anchor name is required");
      subjectId =
        current?.kind === "collective"
          ? current.subjectId
          : createPrefixedId("coll");
      profileEntityId = input.profileEntityId ?? null;
    }

    if (!current && input.kind === "collective") {
      const [created] = await this.db
        .insert(authBrainAnchor)
        .values({
          id: "brain",
          kind: input.kind,
          subjectId,
          displayName,
          profileEntityId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: authBrainAnchor.id })
        .returning();
      if (created) return created;
    }

    const selectedUserStillActiveAdmin = personAnchorUserId
      ? this.db
          .select({ id: authUsers.id })
          .from(authUsers)
          .where(
            and(
              eq(authUsers.id, personAnchorUserId),
              eq(authUsers.personId, subjectId),
              eq(authUsers.role, "admin"),
              eq(authUsers.status, "active"),
            ),
          )
      : undefined;
    const [updated] = await this.db
      .update(authBrainAnchor)
      .set({
        kind: input.kind,
        subjectId,
        displayName,
        profileEntityId,
        updatedAt: now,
      })
      .where(
        and(
          eq(authBrainAnchor.id, "brain"),
          selectedUserStillActiveAdmin
            ? exists(selectedUserStillActiveAdmin)
            : undefined,
        ),
      )
      .returning();

    if (!updated) {
      if (input.kind === "person") {
        throw new Error("The person anchor must be an active admin");
      }
      throw new Error("Brain anchor update failed");
    }
    return updated;
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
        if (!person)
          throw new Error(`Auth person not found: ${input.personId}`);
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

  async listPeople(): Promise<AuthPerson[]> {
    return this.db.select().from(authPeople).orderBy(authPeople.createdAt);
  }

  async getUser(userId: string): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return user;
  }

  async getUserByPersonId(personId: string): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.personId, personId))
      .limit(1);
    return user;
  }

  async updateUserRole(userId: string, role: AuthUserRole): Promise<AuthUser> {
    const existing = await this.requireUser(userId);
    if (existing.role === role) return existing;
    const otherUsers = alias(authUsers, "other_admin_users");
    const isPersonalAnchor = this.db
      .select({ subjectId: authBrainAnchor.subjectId })
      .from(authBrainAnchor)
      .where(
        and(
          eq(authBrainAnchor.id, "brain"),
          eq(authBrainAnchor.kind, "person"),
          eq(authBrainAnchor.subjectId, authUsers.personId),
        ),
      );
    const hasOtherActiveAdmin = this.db
      .select({ id: otherUsers.id })
      .from(otherUsers)
      .where(
        and(
          ne(otherUsers.id, userId),
          eq(otherUsers.role, "admin"),
          eq(otherUsers.status, "active"),
        ),
      );

    await this.db
      .update(authUsers)
      .set({ role, updatedAt: Date.now() })
      .where(
        and(
          eq(authUsers.id, userId),
          role === "admin" ? undefined : notExists(isPersonalAnchor),
          role === "admin"
            ? undefined
            : or(
                ne(authUsers.role, "admin"),
                ne(authUsers.status, "active"),
                exists(hasOtherActiveAdmin),
              ),
        ),
      );

    const updated = await this.requireUser(userId);
    if (updated.role !== role) {
      await this.throwAdminInvariantError(existing);
    }
    return updated;
  }

  async updateUserStatus(
    userId: string,
    status: AuthUserStatus,
  ): Promise<AuthUser> {
    const existing = await this.requireUser(userId);
    if (existing.status === status) return existing;
    const otherUsers = alias(authUsers, "other_active_admin_users");
    const isPersonalAnchor = this.db
      .select({ subjectId: authBrainAnchor.subjectId })
      .from(authBrainAnchor)
      .where(
        and(
          eq(authBrainAnchor.id, "brain"),
          eq(authBrainAnchor.kind, "person"),
          eq(authBrainAnchor.subjectId, authUsers.personId),
        ),
      );
    const hasOtherActiveAdmin = this.db
      .select({ id: otherUsers.id })
      .from(otherUsers)
      .where(
        and(
          ne(otherUsers.id, userId),
          eq(otherUsers.role, "admin"),
          eq(otherUsers.status, "active"),
        ),
      );

    await this.db
      .update(authUsers)
      .set({ status, updatedAt: Date.now() })
      .where(
        and(
          eq(authUsers.id, userId),
          status === "active" ? undefined : notExists(isPersonalAnchor),
          status === "active"
            ? undefined
            : or(
                ne(authUsers.role, "admin"),
                ne(authUsers.status, "active"),
                exists(hasOtherActiveAdmin),
              ),
        ),
      );

    const updated = await this.requireUser(userId);
    if (updated.status !== status) {
      await this.throwAdminInvariantError(existing);
    }
    return updated;
  }

  async ensureIdentity(
    input: AttachAuthIdentityInput,
  ): Promise<{ identity: AuthIdentityRecord; created: boolean }> {
    const identityKeyHash = hashIdentityKey(normalizeIdentityKey(input));
    const [existing] = await this.db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          isNull(authIdentities.revokedAt),
        ),
      )
      .limit(1);
    return {
      identity: await this.attachIdentity(input),
      created: !existing,
    };
  }

  async attachIdentity(
    input: AttachAuthIdentityInput,
  ): Promise<AuthIdentityRecord> {
    const user = await this.requireUser(input.userId);
    const identityKeyHash = hashIdentityKey(normalizeIdentityKey(input));
    const sourceKind = input.source?.kind ?? "admin";
    const sourceId = input.source?.id ?? null;
    const verifiedAt =
      sourceKind === "agent" ? null : (input.verifiedAt ?? null);
    const assurance = verifiedAt === null ? "asserted" : "verified";

    const claimId = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.identityKeyHash, identityKeyHash),
            isNull(authIdentities.revokedAt),
          ),
        )
        .limit(1);

      if (existing && existing.personId !== user.personId) {
        throw new Error(
          "Canonical identity claim belongs to another person; reconciliation required",
        );
      }

      let currentClaimId: string;
      if (existing) {
        currentClaimId = existing.id;
      } else {
        const claim = {
          id: createPrefixedId("aid"),
          personId: user.personId,
          type: input.type,
          issuer: input.issuer ?? null,
          identityKeyHash,
          deliverySubject: input.deliverySubject ?? null,
          label: input.label ?? null,
          visibility: input.visibility ?? "private",
          revokedAt: null,
          createdAt: Date.now(),
        } satisfies typeof authIdentities.$inferInsert;
        await tx.insert(authIdentities).values(claim);
        currentClaimId = claim.id;
      }

      const evidence = await tx
        .select()
        .from(authIdentityEvidence)
        .where(eq(authIdentityEvidence.claimId, currentClaimId));
      const duplicate = evidence.some(
        (item) =>
          item.sourceKind === sourceKind &&
          item.sourceId === sourceId &&
          item.assurance === assurance,
      );
      if (!duplicate) {
        await tx.insert(authIdentityEvidence).values({
          id: createPrefixedId("aev"),
          claimId: currentClaimId,
          sourceKind,
          sourceId,
          assurance,
          verifiedAt,
          createdAt: Date.now(),
        });
      }
      return currentClaimId;
    });

    return this.requireIdentityRecord(claimId);
  }

  async listIdentities(userId: string): Promise<AuthIdentityRecord[]> {
    const user = await this.requireUser(userId);
    const claims = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.personId, user.personId))
      .orderBy(authIdentities.createdAt);
    return Promise.all(claims.map((claim) => this.identityRecord(claim)));
  }

  async listAllIdentities(): Promise<AuthIdentityRecord[]> {
    const [claims, evidence] = await Promise.all([
      this.db.select().from(authIdentities).orderBy(authIdentities.createdAt),
      this.db
        .select()
        .from(authIdentityEvidence)
        .orderBy(authIdentityEvidence.createdAt),
    ]);
    const evidenceByClaimId = new Map<string, AuthIdentityEvidence[]>();
    for (const item of evidence) {
      const claimEvidence = evidenceByClaimId.get(item.claimId) ?? [];
      claimEvidence.push(item);
      evidenceByClaimId.set(item.claimId, claimEvidence);
    }
    return claims.map((claim) =>
      identityRecordFromEvidence(claim, evidenceByClaimId.get(claim.id) ?? []),
    );
  }

  async detachIdentityBySubject(
    input: ResolveAuthIdentityInput & { userId: string },
  ): Promise<AuthIdentityRecord | undefined> {
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

  async detachIdentity(identityId: string): Promise<AuthIdentityRecord> {
    const identity = await this.requireIdentityRecord(identityId);
    if (identity.revokedAt !== null) return identity;

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
      .innerJoin(
        authIdentityEvidence,
        eq(authIdentityEvidence.claimId, authIdentities.id),
      )
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          isNull(authIdentities.revokedAt),
          eq(authIdentityEvidence.assurance, "verified"),
          isNotNull(authIdentityEvidence.verifiedAt),
          eq(authUsers.status, "active"),
        ),
      )
      .limit(1);
    if (row) return { state: "resolved", user: row.user };

    const [knownBinding] = await this.db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.identityKeyHash, identityKeyHash))
      .limit(1);
    return knownBinding ? { state: "denied" } : { state: "unbound" };
  }

  private async throwAdminInvariantError(user: AuthUser): Promise<never> {
    const anchor = await this.getBrainAnchor();
    if (anchor?.kind === "person" && anchor.subjectId === user.personId) {
      throw new Error("Cannot remove the personal brain anchor's admin access");
    }
    throw new Error("Cannot remove the last active admin user");
  }

  private async identityRecord(
    claim: AuthIdentity,
  ): Promise<AuthIdentityRecord> {
    const evidence = await this.db
      .select()
      .from(authIdentityEvidence)
      .where(eq(authIdentityEvidence.claimId, claim.id))
      .orderBy(authIdentityEvidence.createdAt);
    return identityRecordFromEvidence(claim, evidence);
  }

  private async requireIdentityRecord(
    identityId: string,
  ): Promise<AuthIdentityRecord> {
    const [identity] = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.id, identityId))
      .limit(1);
    if (!identity) throw new Error(`Auth identity not found: ${identityId}`);
    return this.identityRecord(identity);
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`Auth user not found: ${userId}`);
    return user;
  }
}

function identityRecordFromEvidence(
  claim: AuthIdentity,
  evidence: AuthIdentityEvidence[],
): AuthIdentityRecord {
  const verifiedAt = evidence.reduce<number | null>((latest, item) => {
    if (item.assurance !== "verified" || item.verifiedAt === null) {
      return latest;
    }
    return latest === null
      ? item.verifiedAt
      : Math.max(latest, item.verifiedAt);
  }, null);
  return { ...claim, evidence, verifiedAt };
}

export function normalizeIdentityKey(input: ResolveAuthIdentityInput): string {
  const subject = input.subject.trim();
  if (!subject) throw new Error("Identity subject is required");

  switch (input.type) {
    case "email":
      return `email:${subject.toLowerCase()}`;
    case "oauth": {
      const issuer = input.issuer?.trim();
      if (!issuer) throw new Error("OAuth identity issuer is required");
      return `oauth:${issuer}:${subject}`;
    }
    default:
      return `${input.type}:${subject}`;
  }
}

export function hashIdentityKey(identityKey: string): string {
  return sha256Hex(identityKey);
}

function canonicalIdForUserId(userId: string): string {
  return `user:${userId.slice("usr_".length)}`;
}
