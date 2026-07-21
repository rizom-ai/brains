import { eq } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authPeople,
  authUsers,
  personExternalPeers,
  type AuthPerson,
  type AuthUser,
  type PersonExternalPeer,
} from "./runtime-schema";

export interface InviteExternalPeerPersonInput {
  peerId: string;
  displayName: string;
  role: "admin" | "trusted";
  createdByUserId: string;
}

export interface InvitedExternalPeerPerson {
  person: AuthPerson;
  user: AuthUser;
  peer: PersonExternalPeer;
}

export interface LinkExternalPeerInput {
  peerId: string;
  personId: string;
  createdByUserId: string;
}

/** Stores access-neutral associations between local people and external peers. */
export class PersonExternalPeerStore {
  private readonly db: AuthRuntimeDB;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async invitePeerPerson(
    input: InviteExternalPeerPersonInput,
  ): Promise<InvitedExternalPeerPerson> {
    const peerId = normalizePeerId(input.peerId);
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, input.createdByUserId);
      const [existing] = await tx
        .select({ peerId: personExternalPeers.peerId })
        .from(personExternalPeers)
        .where(eq(personExternalPeers.peerId, peerId))
        .limit(1);
      if (existing) throw new Error("External peer is already linked");

      const now = Date.now();
      const person = {
        id: createPrefixedId("prsn"),
        displayName: input.displayName,
        profileEntityId: null,
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
      const peer = {
        peerId,
        personId: person.id,
        verificationStatus: "unverified",
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof personExternalPeers.$inferInsert;

      await tx.insert(authPeople).values(person);
      await tx.insert(authUsers).values(user);
      await tx.insert(personExternalPeers).values(peer);
      return { person, user, peer };
    });
  }

  async linkPeer(input: LinkExternalPeerInput): Promise<PersonExternalPeer> {
    const peerId = normalizePeerId(input.peerId);
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, input.createdByUserId);

      const [existing] = await tx
        .select()
        .from(personExternalPeers)
        .where(eq(personExternalPeers.peerId, peerId))
        .limit(1);
      if (existing) {
        if (existing.personId !== input.personId) {
          throw new Error("External peer is already linked to another person");
        }
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

      const now = Date.now();
      const peer = {
        peerId,
        personId: person.id,
        verificationStatus: "unverified",
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof personExternalPeers.$inferInsert;
      await tx.insert(personExternalPeers).values(peer);
      return peer;
    });
  }

  async getByPeerId(peerId: string): Promise<PersonExternalPeer | undefined> {
    const [peer] = await this.db
      .select()
      .from(personExternalPeers)
      .where(eq(personExternalPeers.peerId, normalizePeerId(peerId)))
      .limit(1);
    return peer;
  }

  async listByPersonId(personId: string): Promise<PersonExternalPeer[]> {
    return this.db
      .select()
      .from(personExternalPeers)
      .where(eq(personExternalPeers.personId, personId))
      .orderBy(personExternalPeers.createdAt);
  }

  async listAll(): Promise<PersonExternalPeer[]> {
    return this.db
      .select()
      .from(personExternalPeers)
      .orderBy(personExternalPeers.createdAt);
  }
}

function normalizePeerId(peerId: string): string {
  const normalized = peerId.trim();
  if (!normalized) throw new Error("External peer id is required");
  return normalized;
}

async function requireActiveAdmin(
  db: Pick<AuthRuntimeDB, "select">,
  userId: string,
): Promise<AuthUser> {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  if (user?.role !== "admin" || user.status !== "active") {
    throw new Error("An active Admin is required to link an external peer");
  }
  return user;
}
