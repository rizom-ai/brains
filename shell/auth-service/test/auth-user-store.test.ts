import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-user-store-"));
  tempDirs.push(dir);
  return dir;
}

async function withUserStore<T>(
  callback: (store: AuthUserStore, database: AuthRuntimeDatabase) => Promise<T>,
): Promise<T> {
  const database = new AuthRuntimeDatabase({
    storageDir: await tempStorageDir(),
  });
  await database.start();
  try {
    return await callback(new AuthUserStore(database.db), database);
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
  it("creates the first active anchor user once", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAnchorUser({
        displayName: "Alex Anchor",
      });
      const second = await store.ensureFirstAnchorUser({
        displayName: "Ignored",
      });

      expect(first.id).toStartWith("usr_");
      expect(first.personId).toStartWith("prsn_");
      expect(first).toMatchObject({
        displayName: "Alex Anchor",
        role: "anchor",
        status: "active",
        canonicalId: `user:${first.id.slice("usr_".length)}`,
      });
      expect(second.id).toBe(first.id);
      expect(await store.listUsers()).toHaveLength(1);
      expect(await store.getPerson(first.personId)).toMatchObject({
        id: first.personId,
        displayName: "Alex Anchor",
        profileEntityId: null,
      });
    });
  });

  it("creates only one first anchor during concurrent initialization", async () => {
    await withUserStore(async (store) => {
      const users = await Promise.all([
        store.ensureFirstAnchorUser({ displayName: "First" }),
        store.ensureFirstAnchorUser({ displayName: "Second" }),
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
    await withUserStore(async (store, database) => {
      const user = await store.createUser({
        displayName: "Discord Collaborator",
        role: "trusted",
      });

      const identity = await store.attachIdentity({
        userId: user.id,
        type: "discord",
        subject: "1442828818493735015",
        label: "Alex on Discord",
        verifiedAt: 123,
      });
      expect(identity.personId).toBe(user.personId);

      expect(
        await store.resolveIdentity({
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

  it("preserves agent assertion and provider verification as separate evidence", async () => {
    await withUserStore(async (store) => {
      const user = await store.createUser({ displayName: "Claimed Person" });
      const asserted = await store.attachIdentity({
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
        await store.resolveIdentityAccess({
          type: "discord",
          subject: "1442828818493735015",
        }),
      ).toEqual({ state: "denied" });

      const verified = await store.attachIdentity({
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
      expect(await store.listIdentities(user.id)).toHaveLength(1);
      expect(
        await store.resolveIdentity({
          type: "discord",
          subject: "1442828818493735015",
        }),
      ).toMatchObject({ id: user.id });
    });
  });

  it("does not treat agent-carried verification as authentication evidence", async () => {
    await withUserStore(async (store) => {
      const user = await store.createUser({ displayName: "Asserted Person" });
      const identity = await store.attachIdentity({
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
        await store.resolveIdentityAccess({
          type: "email",
          subject: "asserted@example.com",
        }),
      ).toEqual({ state: "denied" });
    });
  });

  it("allows reattaching an identity after it is detached", async () => {
    await withUserStore(async (store) => {
      const first = await store.createUser({ displayName: "First" });
      const second = await store.createUser({ displayName: "Second" });
      const identity = await store.attachIdentity({
        userId: first.id,
        type: "email",
        subject: "ALEX@Example.COM",
        label: "alex@example.com",
        verifiedAt: 100,
        deliverySubject: "alex@example.com",
      });

      await store.detachIdentity(identity.id);
      await store.attachIdentity({
        userId: second.id,
        type: "email",
        subject: "alex@example.com",
        label: "alex@example.com",
        verifiedAt: 200,
        deliverySubject: "alex@example.com",
      });

      expect(
        await store.resolveIdentity({
          type: "email",
          subject: "alex@example.com",
        }),
      ).toMatchObject({ id: second.id });
    });
  });

  it("protects the last active anchor", async () => {
    await withUserStore(async (store) => {
      const anchor = await store.ensureFirstAnchorUser({
        displayName: "Anchor",
      });

      await expectRejectsWithMessage(
        store.updateUserRole(anchor.id, "trusted"),
        "Cannot remove the last active anchor user",
      );
      await expectRejectsWithMessage(
        store.updateUserStatus(anchor.id, "suspended"),
        "Cannot remove the last active anchor user",
      );

      const secondAnchor = await store.createUser({
        displayName: "Second Anchor",
        role: "anchor",
      });
      await store.updateUserRole(anchor.id, "trusted");
      await expectRejectsWithMessage(
        store.updateUserStatus(secondAnchor.id, "suspended"),
        "Cannot remove the last active anchor user",
      );

      expect(await store.getUser(anchor.id)).toMatchObject({
        role: "trusted",
        status: "active",
      });
      expect(await store.getUser(secondAnchor.id)).toMatchObject({
        role: "anchor",
        status: "active",
      });
    });
  });

  it("atomically preserves an active anchor during concurrent demotions", async () => {
    await withUserStore(async (store) => {
      const first = await store.ensureFirstAnchorUser({ displayName: "First" });
      const second = await store.createUser({
        displayName: "Second",
        role: "anchor",
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
          (user) => user.role === "anchor" && user.status === "active",
        ),
      ).toHaveLength(1);
    });
  });
});
