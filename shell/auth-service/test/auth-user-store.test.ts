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
        displayName: "Alex Owner",
      });
      const second = await store.ensureFirstAnchorUser({
        displayName: "Ignored",
      });

      expect(first.id).toStartWith("usr_");
      expect(first).toMatchObject({
        displayName: "Alex Owner",
        role: "anchor",
        status: "active",
        canonicalId: `user:${first.id.slice("usr_".length)}`,
      });
      expect(second.id).toBe(first.id);
      expect(await store.listUsers()).toHaveLength(1);
    });
  });

  it("resolves verified active identity bindings without storing raw lookup subjects", async () => {
    await withUserStore(async (store, database) => {
      const user = await store.createUser({
        displayName: "Discord Collaborator",
        role: "trusted",
      });

      await store.attachIdentity({
        userId: user.id,
        type: "discord",
        subject: "1442828818493735015",
        label: "Alex on Discord",
        verifiedAt: 123,
      });

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
        sql: "SELECT identity_key_hash, label, delivery_subject FROM auth_identities",
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
      const owner = await store.ensureFirstAnchorUser({ displayName: "Owner" });

      await expectRejectsWithMessage(
        store.updateUserRole(owner.id, "trusted"),
        "Cannot remove the last active anchor user",
      );
      await expectRejectsWithMessage(
        store.updateUserStatus(owner.id, "suspended"),
        "Cannot remove the last active anchor user",
      );

      const secondOwner = await store.createUser({
        displayName: "Second Owner",
        role: "anchor",
      });
      await store.updateUserRole(owner.id, "trusted");
      await expectRejectsWithMessage(
        store.updateUserStatus(secondOwner.id, "suspended"),
        "Cannot remove the last active anchor user",
      );

      expect(await store.getUser(owner.id)).toMatchObject({
        role: "trusted",
        status: "active",
      });
      expect(await store.getUser(secondOwner.id)).toMatchObject({
        role: "anchor",
        status: "active",
      });
    });
  });
});
