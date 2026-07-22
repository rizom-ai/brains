import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthIdentityStore } from "../src/identity-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import {
  authIdentityEvidence,
  setupTokenDeliveries,
  setupTokens,
} from "../src/runtime-schema";
import { setupTokenId } from "../src/setup-state-store";
import { AuthUserStore } from "../src/user-store";
import { sha256Hex } from "@brains/utils/hash";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-user-store-"));
  tempDirs.push(dir);
  return dir;
}

async function withUserStore<T>(
  callback: (
    store: AuthUserStore,
    database: AuthRuntimeDatabase,
    identities: AuthIdentityStore,
  ) => Promise<T>,
): Promise<T> {
  const database = new AuthRuntimeDatabase({
    storageDir: await tempStorageDir(),
  });
  await database.start();
  try {
    const identities = new AuthIdentityStore(database.db);
    return await callback(
      new AuthUserStore(database.db, identities),
      database,
      identities,
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
    if (error instanceof Error) {
      expect(error.message).toBe(message);
    }
    return;
  }
  throw new Error("Expected operation to reject");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthUserStore", () => {
  it("creates the first active admin as the personal brain anchor once", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAdminUser({
        displayName: "Alex Admin",
      });
      const second = await store.ensureFirstAdminUser({
        displayName: "Ignored",
      });

      expect(first.id).toStartWith("usr_");
      expect(first.personId).toStartWith("prsn_");
      expect(first).toMatchObject({
        displayName: "Alex Admin",
        role: "admin",
        status: "active",
        canonicalId: `user:${first.id.slice("usr_".length)}`,
      });
      expect(second.id).toBe(first.id);
      expect(await store.listUsers()).toHaveLength(1);
      expect(await store.getPerson(first.personId)).toMatchObject({
        id: first.personId,
        displayName: "Alex Admin",
        profileEntityId: null,
      });
      expect(await store.getBrainAnchor()).toMatchObject({
        kind: "person",
        subjectId: first.personId,
        displayName: "Alex Admin",
      });
    });
  });

  it("creates only one first admin during concurrent initialization", async () => {
    await withUserStore(async (store) => {
      const users = await Promise.all([
        store.ensureFirstAdminUser({ displayName: "First" }),
        store.ensureFirstAdminUser({ displayName: "Second" }),
      ]);

      expect(users[0].id).toBe(users[1].id);
      expect(await store.listUsers()).toHaveLength(1);
    });
  });

  it("creates a distinct person subject transactionally with each user", async () => {
    await withUserStore(async (store) => {
      const first = await store.createUser({ displayName: "First" });
      const second = await store.createUser({ displayName: "Second" });

      expect(first.personId).not.toBe(second.personId);
      expect(await store.getPerson(first.personId)).toMatchObject({
        displayName: "First",
      });
      expect(await store.getPerson(second.personId)).toMatchObject({
        displayName: "Second",
      });
    });
  });

  it("creates an invited user facet for an existing person", async () => {
    await withUserStore(async (store) => {
      const person = await store.createPerson({
        displayName: "Promoted Person",
        profileEntityId: "person-profile/promoted-person",
      });
      const user = await store.createUser({
        displayName: "Promoted Person",
        personId: person.id,
        role: "trusted",
        status: "invited",
      });

      expect(user).toMatchObject({
        personId: person.id,
        role: "trusted",
        status: "invited",
      });
      expect(await store.getPerson(person.id)).toEqual(person);
    });
  });

  it("resolves verified active identity bindings without storing raw lookup subjects", async () => {
    await withUserStore(async (store, database, identities) => {
      const user = await store.createUser({
        displayName: "Discord Collaborator",
        role: "trusted",
      });

      const identity = await identities.attachIdentity({
        userId: user.id,
        type: "discord",
        subject: "1442828818493735015",
        label: "Alex on Discord",
        verifiedAt: 123,
      });
      expect(identity.personId).toBe(user.personId);

      expect(
        await identities.resolveIdentity({
          type: "discord",
          subject: "1442828818493735015",
        }),
      ).toMatchObject({
        id: user.id,
        displayName: "Discord Collaborator",
        role: "trusted",
      });

      const rows = await database.client.execute({
        sql: "SELECT identity_key_hash, label, delivery_subject FROM person_identity_claims",
        args: [],
      });
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.["identity_key_hash"]).not.toBe(
        "discord:1442828818493735015",
      );
      expect(rows.rows[0]?.["label"]).toBe("Alex on Discord");
      expect(rows.rows[0]?.["delivery_subject"]).toBeNull();
    });
  });

  it("atomically binds a confirmed setup delivery and activates its invited user", async () => {
    await withUserStore(async (store, database, identities) => {
      const user = await store.createUser({
        displayName: "Invited Person",
        role: "trusted",
        status: "invited",
      });
      const identity = await identities.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "invited@example.com",
        deliverySubject: "invited@example.com",
        label: "invited@example.com",
        source: { kind: "admin" },
      });
      const tokenHash = setupTokenId("setup_delivered");
      await database.db.insert(setupTokens).values({
        tokenHash,
        purpose: "passkey_setup",
        targetUserId: user.id,
        deliveryClaimId: identity.id,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: Math.floor(Date.now() / 1000),
      });
      await database.db.insert(setupTokenDeliveries).values({
        tokenHash,
        recipientHash: sha256Hex("invited@example.com"),
        deliveredAt: Math.floor(Date.now() / 1000),
        deliveryId: "email_1",
      });

      const completed = await store.completeTargetedSetup({
        userId: user.id,
        setupTokenId: tokenHash,
      });

      expect(completed).toMatchObject({
        user: { id: user.id, status: "active" },
        boundIdentity: { id: identity.id, type: "email" },
      });
      expect(
        await identities.resolveIdentity({
          type: "email",
          subject: "invited@example.com",
        }),
      ).toMatchObject({ id: user.id, status: "active" });
      expect(await identities.listIdentities(user.id)).toEqual([
        expect.objectContaining({
          id: identity.id,
          verifiedAt: expect.any(Number),
        }),
      ]);
      const tokenRows = await database.db
        .select({ consumedAt: setupTokens.consumedAt })
        .from(setupTokens);
      expect(tokenRows[0]?.consumedAt).toEqual(expect.any(Number));
      const verifiedEvidence = await database.db
        .select()
        .from(authIdentityEvidence);
      expect(verifiedEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            claimId: identity.id,
            sourceKind: "provider",
            sourceId: null,
            assurance: "verified",
            verifiedAt: expect.any(Number),
          }),
        ]),
      );

      await expectRejectsWithMessage(
        store.completeTargetedSetup({
          userId: user.id,
          setupTokenId: tokenHash,
        }),
        "Invalid or consumed setup token",
      );
    });
  });

  it("refuses wrong-user and suspended setup delivery claims without consuming them", async () => {
    await withUserStore(async (store, database, identities) => {
      const owner = await store.createUser({
        displayName: "Claim Owner",
        role: "trusted",
        status: "invited",
      });
      const target = await store.createUser({
        displayName: "Wrong Target",
        role: "trusted",
        status: "invited",
      });
      const identity = await identities.attachIdentity({
        userId: owner.id,
        type: "discord",
        subject: "123456789",
        deliverySubject: "123456789",
        label: "@claim-owner",
        source: { kind: "admin" },
      });
      const wrongTokenHash = setupTokenId("setup_wrong_user");
      await database.db.insert(setupTokens).values({
        tokenHash: wrongTokenHash,
        purpose: "passkey_setup",
        targetUserId: target.id,
        deliveryClaimId: identity.id,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: Math.floor(Date.now() / 1000),
      });
      await database.db.insert(setupTokenDeliveries).values({
        tokenHash: wrongTokenHash,
        recipientHash: sha256Hex("123456789"),
        deliveredAt: Math.floor(Date.now() / 1000),
        deliveryId: null,
      });

      await expectRejectsWithMessage(
        store.completeTargetedSetup({
          userId: target.id,
          setupTokenId: wrongTokenHash,
        }),
        "Setup delivery identity does not belong to target user",
      );
      await store.updateUserStatus(target.id, "suspended");
      await expectRejectsWithMessage(
        store.completeTargetedSetup({
          userId: target.id,
          setupTokenId: wrongTokenHash,
        }),
        "Passkey registration user is unavailable",
      );

      expect(await store.getUser(target.id)).toMatchObject({
        status: "suspended",
      });
      const [token] = await database.db
        .select({ consumedAt: setupTokens.consumedAt })
        .from(setupTokens);
      expect(token?.consumedAt).toBeNull();
      expect(
        (await identities.listIdentities(owner.id))[0]?.verifiedAt,
      ).toBeNull();

      const undeliveredTokenHash = setupTokenId("setup_undelivered");
      await database.db.insert(setupTokens).values({
        tokenHash: undeliveredTokenHash,
        purpose: "passkey_setup",
        targetUserId: owner.id,
        deliveryClaimId: identity.id,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: Math.floor(Date.now() / 1000),
      });
      await expectRejectsWithMessage(
        store.completeTargetedSetup({
          userId: owner.id,
          setupTokenId: undeliveredTokenHash,
        }),
        "Setup delivery was not confirmed",
      );
      expect(await store.getUser(owner.id)).toMatchObject({
        status: "invited",
      });
    });
  });

  it("preserves agent assertion and provider verification as separate evidence", async () => {
    await withUserStore(async (store, _database, identities) => {
      const user = await store.createUser({ displayName: "Claimed Person" });
      const asserted = await identities.attachIdentity({
        userId: user.id,
        type: "discord",
        subject: "1442828818493735015",
        label: "@claimed",
        source: { kind: "agent", id: "agent:claimed" },
      });

      expect(asserted).toMatchObject({
        personId: user.personId,
        visibility: "private",
        verifiedAt: null,
      });
      expect(asserted.evidence).toEqual([
        expect.objectContaining({
          claimId: asserted.id,
          sourceKind: "agent",
          sourceId: "agent:claimed",
          assurance: "asserted",
          verifiedAt: null,
        }),
      ]);
      expect(
        await identities.resolveIdentityAccess({
          type: "discord",
          subject: "1442828818493735015",
        }),
      ).toEqual({ state: "denied" });

      const verified = await identities.attachIdentity({
        userId: user.id,
        type: "discord",
        subject: "1442828818493735015",
        verifiedAt: 200,
        source: { kind: "provider", id: "discord" },
      });

      expect(verified.id).toBe(asserted.id);
      expect(verified.verifiedAt).toBe(200);
      expect(verified.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceKind: "agent",
            assurance: "asserted",
          }),
          expect.objectContaining({
            sourceKind: "provider",
            sourceId: "discord",
            assurance: "verified",
            verifiedAt: 200,
          }),
        ]),
      );
      expect(await identities.listIdentities(user.id)).toHaveLength(1);
      expect(
        await identities.resolveIdentity({
          type: "discord",
          subject: "1442828818493735015",
        }),
      ).toMatchObject({ id: user.id });
    });
  });

  it("blocks conflicting exact claims across people for reconciliation", async () => {
    await withUserStore(async (store, _database, identities) => {
      const first = await store.createUser({ displayName: "First Person" });
      const second = await store.createUser({ displayName: "Second Person" });
      await identities.attachIdentity({
        userId: first.id,
        type: "discord",
        subject: "1442828818493735015",
        verifiedAt: 200,
        source: { kind: "provider", id: "discord" },
      });

      await expectRejectsWithMessage(
        identities.attachIdentity({
          userId: second.id,
          type: "discord",
          subject: "1442828818493735015",
          source: { kind: "agent", id: "agent:second" },
        }),
        "Canonical identity claim belongs to another person; reconciliation required",
      );
      expect(await identities.listIdentities(second.id)).toHaveLength(0);
    });
  });

  it("does not treat agent-carried verification as authentication evidence", async () => {
    await withUserStore(async (store, _database, identities) => {
      const user = await store.createUser({ displayName: "Asserted Person" });
      const identity = await identities.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "asserted@example.com",
        verifiedAt: 300,
        source: { kind: "agent", id: "agent:asserted" },
      });

      expect(identity.verifiedAt).toBeNull();
      expect(identity.evidence).toEqual([
        expect.objectContaining({
          sourceKind: "agent",
          sourceId: "agent:asserted",
          assurance: "asserted",
          verifiedAt: null,
        }),
      ]);
      expect(
        await identities.resolveIdentityAccess({
          type: "email",
          subject: "asserted@example.com",
        }),
      ).toEqual({ state: "denied" });
    });
  });

  it("allows reattaching an identity after it is detached", async () => {
    await withUserStore(async (store, _database, identities) => {
      const first = await store.createUser({ displayName: "First" });
      const second = await store.createUser({ displayName: "Second" });
      const identity = await identities.attachIdentity({
        userId: first.id,
        type: "email",
        subject: "ALEX@Example.COM",
        label: "alex@example.com",
        verifiedAt: 100,
        deliverySubject: "alex@example.com",
      });

      await identities.detachIdentity(identity.id);
      await identities.attachIdentity({
        userId: second.id,
        type: "email",
        subject: "alex@example.com",
        label: "alex@example.com",
        verifiedAt: 200,
        deliverySubject: "alex@example.com",
      });

      expect(
        await identities.resolveIdentity({
          type: "email",
          subject: "alex@example.com",
        }),
      ).toMatchObject({ id: second.id });
    });
  });

  it("protects the personal anchor and the last active admin", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAdminUser({
        displayName: "First Admin",
      });

      await expectRejectsWithMessage(
        store.updateUserRole(first.id, "trusted"),
        "Cannot remove the personal brain anchor's admin access",
      );
      await expectRejectsWithMessage(
        store.updateUserStatus(first.id, "suspended"),
        "Cannot remove the personal brain anchor's admin access",
      );

      const second = await store.createUser({
        displayName: "Second Admin",
        role: "admin",
      });
      await expectRejectsWithMessage(
        store.updateUserRole(first.id, "trusted"),
        "Cannot remove the personal brain anchor's admin access",
      );

      await store.configureBrainAnchor({
        kind: "collective",
        displayName: "Example Collective",
        profileEntityId: "anchor-profile/anchor-profile",
      });
      await store.updateUserRole(first.id, "trusted");
      await expectRejectsWithMessage(
        store.updateUserStatus(second.id, "suspended"),
        "Cannot remove the last active admin user",
      );

      expect(await store.getUser(first.id)).toMatchObject({
        role: "trusted",
        status: "active",
      });
      expect(await store.getUser(second.id)).toMatchObject({
        role: "admin",
        status: "active",
      });
    });
  });

  it("projects collective config before setup without making the first Admin the Anchor", async () => {
    await withUserStore(async (store) => {
      await store.configureBrainAnchor({
        kind: "collective",
        displayName: "The Peppers",
        profileEntityId: "anchor-profile/anchor-profile",
      });
      const first = await store.ensureFirstAdminUser({ displayName: "Alice" });

      expect(await store.getBrainAnchor()).toMatchObject({
        kind: "collective",
        displayName: "The Peppers",
        profileEntityId: "anchor-profile/anchor-profile",
      });
      expect((await store.getBrainAnchor())?.subjectId).not.toBe(
        first.personId,
      );
    });
  });

  it("projects personal config onto the first active Admin and profile reference", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAdminUser({ displayName: "Alice" });

      await store.configureBrainAnchor({
        kind: "person",
        displayName: "Alice Morgan",
        profileEntityId: "anchor-profile/anchor-profile",
      });

      expect(await store.getBrainAnchor()).toMatchObject({
        kind: "person",
        subjectId: first.personId,
        displayName: "Alice Morgan",
        profileEntityId: "anchor-profile/anchor-profile",
      });
      expect(await store.getPerson(first.personId)).toMatchObject({
        profileEntityId: "anchor-profile/anchor-profile",
      });
    });
  });

  it("atomically preserves an active admin during concurrent demotions", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAdminUser({ displayName: "First" });
      const second = await store.createUser({
        displayName: "Second",
        role: "admin",
      });
      await store.configureBrainAnchor({
        kind: "collective",
        displayName: "Example Collective",
        profileEntityId: "anchor-profile/anchor-profile",
      });

      const results = await Promise.allSettled([
        store.updateUserRole(first.id, "trusted"),
        store.updateUserRole(second.id, "trusted"),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        (await store.listUsers()).filter(
          (user) => user.role === "admin" && user.status === "active",
        ),
      ).toHaveLength(1);
    });
  });

  it("atomically preserves an active admin across concurrent role and status changes", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAdminUser({ displayName: "First" });
      const second = await store.createUser({
        displayName: "Second",
        role: "admin",
      });
      await store.configureBrainAnchor({
        kind: "collective",
        displayName: "Example Collective",
        profileEntityId: "anchor-profile/anchor-profile",
      });

      const results = await Promise.allSettled([
        store.updateUserRole(first.id, "trusted"),
        store.updateUserStatus(second.id, "suspended"),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        (await store.listUsers()).filter(
          (user) => user.role === "admin" && user.status === "active",
        ),
      ).toHaveLength(1);
    });
  });
});
