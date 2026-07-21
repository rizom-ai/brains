import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonExternalPeerStore } from "../src/person-external-peer-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

async function withStores<T>(
  callback: (
    users: AuthUserStore,
    peers: PersonExternalPeerStore,
  ) => Promise<T>,
): Promise<T> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-person-peer-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    return await callback(
      new AuthUserStore(database.db),
      new PersonExternalPeerStore(database.db),
    );
  } finally {
    await database.stop();
  }
}

async function expectRejectsWithMessage(
  operation: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) expect(error.message).toBe(message);
    return;
  }
  throw new Error("Expected operation to reject");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("PersonExternalPeerStore", () => {
  it("atomically creates an invited account and independent peer link", async () => {
    await withStores(async (users, peers) => {
      const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });

      const invited = await peers.invitePeerPerson({
        peerId: "did:web:mira.example",
        displayName: "Mira Reyes",
        role: "trusted",
        createdByUserId: admin.id,
      });

      expect(invited.person).toMatchObject({
        displayName: "Mira Reyes",
        profileEntityId: null,
      });
      expect(invited.user).toMatchObject({
        personId: invited.person.id,
        role: "trusted",
        status: "invited",
      });
      expect(invited.peer).toMatchObject({
        peerId: "did:web:mira.example",
        personId: invited.person.id,
        verificationStatus: "unverified",
        createdByUserId: admin.id,
      });
    });
  });

  it("links a peer as an independent facet without inherited access", async () => {
    await withStores(async (users, peers) => {
      const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });
      const member = await users.createUser({ displayName: "Mira Reyes" });

      const peer = await peers.linkPeer({
        peerId: "https://mira.example/.well-known/agent-card.json",
        personId: member.personId,
        createdByUserId: admin.id,
      });

      expect(peer).toMatchObject({
        peerId: "https://mira.example/.well-known/agent-card.json",
        personId: member.personId,
        verificationStatus: "unverified",
        createdByUserId: admin.id,
      });
      expect(await peers.listByPersonId(member.personId)).toEqual([peer]);
    });
  });

  it("is idempotent for the same person and never switches a peer silently", async () => {
    await withStores(async (users, peers) => {
      const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });
      const first = await users.createPerson({ displayName: "First" });
      const second = await users.createPerson({ displayName: "Second" });
      const input = {
        peerId: "did:web:peer.example",
        personId: first.id,
        createdByUserId: admin.id,
      };

      const linked = await peers.linkPeer(input);
      expect(await peers.linkPeer(input)).toEqual(linked);
      await expectRejectsWithMessage(
        peers.linkPeer({ ...input, personId: second.id }),
        "External peer is already linked to another person",
      );
    });
  });

  it("requires an active Admin for a new association", async () => {
    await withStores(async (users, peers) => {
      await users.ensureFirstAdminUser({ displayName: "Admin" });
      const trusted = await users.createUser({
        displayName: "Trusted",
        role: "trusted",
      });

      await expectRejectsWithMessage(
        peers.linkPeer({
          peerId: "did:web:peer.example",
          personId: trusted.personId,
          createdByUserId: trusted.id,
        }),
        "An active Admin is required to link an external peer",
      );
      expect(await peers.getByPeerId("did:web:peer.example")).toBeUndefined();
    });
  });
});
