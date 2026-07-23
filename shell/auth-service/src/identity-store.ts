import { sha256Hex } from "@brains/utils/hash";
import { createPrefixedId } from "@brains/utils/id";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authIdentityEvidence,
  authUsers,
  type AuthIdentity,
  type AuthIdentityEvidence,
  type AuthUser,
} from "./runtime-schema";

export type AuthIdentityType = AuthIdentity["type"];
export type AuthIdentitySourceKind = AuthIdentityEvidence["sourceKind"];
export type AuthIdentityVisibility = AuthIdentity["visibility"];

export interface AuthIdentityRecord extends AuthIdentity {
  evidence: AuthIdentityEvidence[];
  verifiedAt: number | null;
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

export class AuthIdentityStore {
  private readonly db: AuthRuntimeDB;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
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
        if (
          input.deliverySubject &&
          existing.deliverySubject &&
          input.deliverySubject.trim().toLowerCase() !==
            existing.deliverySubject.trim().toLowerCase()
        ) {
          throw new Error("Identity delivery subject does not match the claim");
        }
        if (
          (!existing.deliverySubject && input.deliverySubject) ||
          (!existing.label && input.label)
        ) {
          await tx
            .update(authIdentities)
            .set({
              ...(!existing.deliverySubject && input.deliverySubject
                ? { deliverySubject: input.deliverySubject }
                : {}),
              ...(!existing.label && input.label ? { label: input.label } : {}),
            })
            .where(eq(authIdentities.id, existing.id));
        }
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

    return this.getIdentity(claimId);
  }

  async listIdentities(userId: string): Promise<AuthIdentityRecord[]> {
    const user = await this.requireUser(userId);
    const claims = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.personId, user.personId))
      .orderBy(authIdentities.createdAt, sql`rowid`);
    return Promise.all(claims.map((claim) => this.identityRecord(claim)));
  }

  async listAllIdentities(): Promise<AuthIdentityRecord[]> {
    const [claims, evidence] = await Promise.all([
      this.db
        .select()
        .from(authIdentities)
        .orderBy(authIdentities.createdAt, sql`rowid`),
      this.db
        .select()
        .from(authIdentityEvidence)
        .orderBy(authIdentityEvidence.createdAt, sql`rowid`),
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
    const identity = await this.getIdentity(identityId);
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

  async getIdentity(identityId: string): Promise<AuthIdentityRecord> {
    const [identity] = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.id, identityId))
      .limit(1);
    if (!identity) throw new Error(`Auth identity not found: ${identityId}`);
    return this.identityRecord(identity);
  }

  private async identityRecord(
    claim: AuthIdentity,
  ): Promise<AuthIdentityRecord> {
    const evidence = await this.db
      .select()
      .from(authIdentityEvidence)
      .where(eq(authIdentityEvidence.claimId, claim.id))
      .orderBy(authIdentityEvidence.createdAt, sql`rowid`);
    return identityRecordFromEvidence(claim, evidence);
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
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
