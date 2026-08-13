import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAccountSettingsStore } from "../src/account-settings-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

async function setup(): Promise<{
  database: AuthRuntimeDatabase;
  actorId: string;
  dir: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "brains-account-settings-"));
  tempDirs.push(dir);
  const database = new AuthRuntimeDatabase({ storageDir: dir });
  await database.start();
  const users = new AuthUserStore(database.db);
  await users.ensureFirstAdminUser();
  const actor = await users.createUser({ displayName: "Mailbox owner" });
  return { database, actorId: actor.id, dir };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("auth account settings store", () => {
  it("encrypts values at rest, decrypts with authenticated identity, and increments revisions", async () => {
    const { database, actorId, dir } = await setup();
    try {
      const store = new AuthAccountSettingsStore(
        database.db,
        "test-account-settings-encryption-key-0001",
      );
      const identity = {
        packageName: "@fixture/mailbox",
        definitionId: "mailbox",
        actorId,
      };
      expect(
        await store.write(identity, {
          host: "imap.example.com",
          password: "stored-mailbox-secret",
        }),
      ).toMatchObject({ revision: 1 });
      expect(await store.read(identity)).toEqual({
        values: {
          host: "imap.example.com",
          password: "stored-mailbox-secret",
        },
        revision: 1,
      });
      const wrongKeyStore = new AuthAccountSettingsStore(
        database.db,
        "different-account-settings-key-0000001",
      );
      expect(wrongKeyStore.read(identity)).rejects.toThrow(
        "could not be decrypted",
      );
      expect(
        await store.write(identity, {
          host: "mail.example.com",
          password: "rotated-mailbox-secret",
        }),
      ).toMatchObject({ revision: 2 });
      await database.stop();

      const client = createClient({ url: `file:${join(dir, "auth.db")}` });
      try {
        const rows = await client.execute(
          "SELECT payload FROM auth_account_plugin_settings",
        );
        const payload = String(rows.rows[0]?.["payload"]);
        expect(payload).not.toContain("imap.example.com");
        expect(payload).not.toContain("mailbox-secret");
      } finally {
        client.close();
      }
    } finally {
      await database.stop();
    }
  });

  it("cascades stored settings when the auth account is deleted", async () => {
    const { database, actorId } = await setup();
    try {
      const store = new AuthAccountSettingsStore(
        database.db,
        "test-account-settings-encryption-key-0001",
      );
      const identity = {
        packageName: "@fixture/mailbox",
        definitionId: "mailbox",
        actorId,
      };
      await store.write(identity, { password: "secret" });
      const users = new AuthUserStore(database.db);
      await users.updateUserStatus(actorId, "suspended");
      await users.deleteSuspendedUser(actorId);
      expect(await store.read(identity)).toBeNull();
    } finally {
      await database.stop();
    }
  });
});
