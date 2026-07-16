import { and, eq, isNull } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  agentPersonLinks,
  authIdentities,
  authIdentityEvidence,
  authPeople,
  authUsers,
  type AgentPersonLink,
  type AuthPerson,
  type AuthUser,
} from "./runtime-schema";
import {
  hashIdentityKey,
  normalizeIdentityKey,
  type AuthIdentityType,
  type AuthIdentityVisibility,
} from "./user-store";

export interface AgentPersonIdentityClaimInput {
  type: Exclude<AuthIdentityType, "passkey" | "a2a">;
  subject: string;
  issuer?: string | undefined;
  label?: string | undefined;
  visibility?: AuthIdentityVisibility | undefined;
}

export interface LinkAgentToPersonInput {
  agentId: string;
  personId: string;
  createdByUserId: string;
  claims?: AgentPersonIdentityClaimInput[];
}

export interface PromoteAgentPersonInput {
  agentId: string;
  displayName: string;
  profileEntityId?: string;
  role: AuthUser["role"];
  createdByUserId: string;
  claims?: AgentPersonIdentityClaimInput[];
}

export interface PromotedAgentPerson {
  person: AuthPerson;
  user: AuthUser;
  link: AgentPersonLink;
}

/**
 * Stores consent-bearing links between runtime people and agent directory ids.
 * Profile and provider identity data remain person-owned and are not copied.
 */
export class PersonAgentStore {
  private readonly db: AuthRuntimeDB;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async promoteAgentPerson(
    input: PromoteAgentPersonInput,
  ): Promise<PromotedAgentPerson> {
    const agentId = normalizeAgentId(input.agentId);
    return this.db.transaction(async (tx) => {
      const [existingLink] = await tx
        .select()
        .from(agentPersonLinks)
        .where(eq(agentPersonLinks.agentId, agentId))
        .limit(1);
      if (existingLink) {
        const [[person], [user]] = await Promise.all([
          tx
            .select()
            .from(authPeople)
            .where(eq(authPeople.id, existingLink.personId))
            .limit(1),
          tx
            .select()
            .from(authUsers)
            .where(eq(authUsers.personId, existingLink.personId))
            .limit(1),
        ]);
        if (person && user) {
          await attachAgentClaims(tx, person.id, agentId, input.claims ?? []);
          return { person, user, link: existingLink };
        }
        throw new Error(
          "Agent is already linked to a person without an auth user",
        );
      }

      await requireUser(tx, input.createdByUserId);
      const now = Date.now();
      const person = {
        id: createPrefixedId("prsn"),
        displayName: input.displayName,
        profileEntityId: input.profileEntityId ?? null,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authPeople.$inferInsert;
      const userId = createPrefixedId("usr");
      const user = {
        id: userId,
        personId: person.id,
        displayName: input.displayName,
        role: input.role,
        status: "invited",
        canonicalId: `user:${userId.slice("usr_".length)}`,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authUsers.$inferInsert;
      const link = {
        agentId,
        personId: person.id,
        status: "pending",
        createdByUserId: input.createdByUserId,
        consentedByUserId: null,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof agentPersonLinks.$inferInsert;

      await tx.insert(authPeople).values(person);
      await tx.insert(authUsers).values(user);
      await attachAgentClaims(tx, person.id, agentId, input.claims ?? []);
      await tx.insert(agentPersonLinks).values(link);
      return { person, user, link };
    });
  }

  async getByAgentId(agentId: string): Promise<AgentPersonLink | undefined> {
    const [link] = await this.db
      .select()
      .from(agentPersonLinks)
      .where(eq(agentPersonLinks.agentId, normalizeAgentId(agentId)))
      .limit(1);
    return link;
  }

  async listByPersonId(personId: string): Promise<AgentPersonLink[]> {
    return this.db
      .select()
      .from(agentPersonLinks)
      .where(eq(agentPersonLinks.personId, personId))
      .orderBy(agentPersonLinks.createdAt);
  }

  async linkAgent(input: LinkAgentToPersonInput): Promise<AgentPersonLink> {
    const agentId = normalizeAgentId(input.agentId);
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(agentPersonLinks)
        .where(eq(agentPersonLinks.agentId, agentId))
        .limit(1);
      if (existing) {
        if (existing.personId !== input.personId) {
          throw new Error("Agent is already linked to another person");
        }
        await attachAgentClaims(
          tx,
          existing.personId,
          agentId,
          input.claims ?? [],
        );
        return existing;
      }

      const [person] = await tx
        .select({ id: authPeople.id })
        .from(authPeople)
        .where(eq(authPeople.id, input.personId))
        .limit(1);
      if (!person) {
        throw new Error(`Auth person not found: ${input.personId}`);
      }

      const creator = await requireUser(tx, input.createdByUserId);
      const isSelfLink = creator.personId === input.personId;
      const now = Date.now();
      const link = {
        agentId,
        personId: input.personId,
        status: isSelfLink ? "active" : "pending",
        createdByUserId: creator.id,
        consentedByUserId: isSelfLink ? creator.id : null,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof agentPersonLinks.$inferInsert;
      await attachAgentClaims(tx, input.personId, agentId, input.claims ?? []);
      await tx.insert(agentPersonLinks).values(link);
      return link;
    });
  }

  async acceptRepresentation(
    agentId: string,
    userId: string,
  ): Promise<AgentPersonLink> {
    return this.db.transaction(async (tx) => {
      const normalizedAgentId = normalizeAgentId(agentId);
      const [link] = await tx
        .select()
        .from(agentPersonLinks)
        .where(eq(agentPersonLinks.agentId, normalizedAgentId))
        .limit(1);
      if (!link) {
        throw new Error(`Agent-person link not found: ${normalizedAgentId}`);
      }

      const user = await requireUser(tx, userId);
      if (user.personId !== link.personId) {
        throw new Error(
          "Only the represented person can accept this agent link",
        );
      }
      if (link.status === "active" && link.consentedByUserId === user.id) {
        return link;
      }

      const updatedAt = Date.now();
      await tx
        .update(agentPersonLinks)
        .set({ status: "active", consentedByUserId: user.id, updatedAt })
        .where(eq(agentPersonLinks.agentId, normalizedAgentId));
      return {
        ...link,
        status: "active",
        consentedByUserId: user.id,
        updatedAt,
      };
    });
  }
}

type AgentClaimDatabase = Pick<AuthRuntimeDB, "select" | "insert">;

async function attachAgentClaims(
  db: AgentClaimDatabase,
  personId: string,
  agentId: string,
  claims: AgentPersonIdentityClaimInput[],
): Promise<void> {
  const uniqueClaims = new Map<
    string,
    { input: AgentPersonIdentityClaimInput; identityKeyHash: string }
  >();
  for (const input of claims) {
    const identityKeyHash = hashIdentityKey(
      normalizeIdentityKey({
        type: input.type,
        subject: input.subject,
        ...(input.issuer ? { issuer: input.issuer } : {}),
      }),
    );
    uniqueClaims.set(identityKeyHash, { input, identityKeyHash });
  }

  const prepared = await Promise.all(
    Array.from(uniqueClaims.values()).map(async (claim) => {
      const [existing] = await db
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.identityKeyHash, claim.identityKeyHash),
            isNull(authIdentities.revokedAt),
          ),
        )
        .limit(1);
      if (existing && existing.personId !== personId) {
        throw new Error(
          "Canonical identity claim belongs to another person; reconciliation required",
        );
      }
      return { ...claim, existing };
    }),
  );

  for (const claim of prepared) {
    const claimId = claim.existing?.id ?? createPrefixedId("aid");
    if (!claim.existing) {
      await db.insert(authIdentities).values({
        id: claimId,
        personId,
        type: claim.input.type,
        issuer: claim.input.issuer ?? null,
        identityKeyHash: claim.identityKeyHash,
        deliverySubject: null,
        label: claim.input.label ?? null,
        visibility: claim.input.visibility ?? "private",
        revokedAt: null,
        createdAt: Date.now(),
      });
    }

    const evidence = await db
      .select()
      .from(authIdentityEvidence)
      .where(eq(authIdentityEvidence.claimId, claimId));
    const alreadyAsserted = evidence.some(
      (item) =>
        item.sourceKind === "agent" &&
        item.sourceId === agentId &&
        item.assurance === "asserted",
    );
    if (!alreadyAsserted) {
      await db.insert(authIdentityEvidence).values({
        id: createPrefixedId("aev"),
        claimId,
        sourceKind: "agent",
        sourceId: agentId,
        assurance: "asserted",
        verifiedAt: null,
        createdAt: Date.now(),
      });
    }
  }
}

function normalizeAgentId(agentId: string): string {
  const normalized = agentId.trim();
  if (!normalized) {
    throw new Error("Agent id is required");
  }
  return normalized;
}

async function requireUser(
  db: Pick<AuthRuntimeDB, "select">,
  userId: string,
): Promise<AuthUser> {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  if (!user) {
    throw new Error(`Auth user not found: ${userId}`);
  }
  return user;
}
