import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthAuditStore,
  AuthIdentityStore,
  AuthRuntimeDatabase,
  AuthUserStore,
} from "../src";
import {
  RuntimePasskeyStore,
  type StoredPasskey,
} from "../src/credential-store";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-passkey-registration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("runtime passkey registration persistence", () => {
  it("creates a verified identity binding and audit event", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const users = new AuthUserStore(database.db);
      const user = await users.ensureFirstAdminUser();
      const store = new RuntimePasskeyStore(database);
      await store.addCredential({
        id: "new-credential",
        userId: user.id,
        publicKey: "public-key",
        counter: 0,
        transports: ["internal"],
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      });

      expect(
        await new AuthIdentityStore(database.db).resolveIdentityAccess({
          type: "passkey",
          subject: "new-credential",
        }),
      ).toMatchObject({ state: "resolved", user: { id: user.id } });
      expect(
        (await new AuthAuditStore(database.db).list()).map((event) => ({
          action: event.action,
          targetId: event.targetId,
          metadata: event.metadata,
        })),
      ).toContainEqual({
        action: "auth.passkey.registered",
        targetId: "new-credential",
        metadata: { userId: user.id },
      });
    } finally {
      await database.stop();
    }
  });
});

describe("runtime passkey store records", () => {
  it("reads credentials and challenges back as their stored records", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const user = await new AuthUserStore(database.db).ensureFirstAdminUser();
      const store = new RuntimePasskeyStore(database);
      await store.addCredential({
        id: "credential",
        userId: user.id,
        publicKey: "public-key",
        counter: 3,
        transports: ["internal"],
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        createdAt: 1_700_000_000_123,
        updatedAt: 1_700_000_000_456,
      });
      const expected: StoredPasskey = {
        id: "credential",
        userId: user.id,
        publicKey: "public-key",
        counter: 3,
        transports: ["internal"],
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        createdAt: 1_700_000_000_123,
        updatedAt: 1_700_000_000_456,
      };

      expect(await store.listCredentials(user.id)).toEqual([expected]);
      expect(await store.getCredential("credential")).toEqual(expected);

      await store.saveRegistrationChallenge("registration", user.id);
      expect(await store.consumeRegistrationChallenge("registration")).toEqual(
        expect.objectContaining({ kind: "registration", userId: user.id }),
      );
      expect(
        await store.consumeRegistrationChallenge("registration"),
      ).toBeUndefined();

      await store.saveAuthenticationChallenge("authentication");
      expect(
        await store.consumeAuthenticationChallenge("authentication"),
      ).toEqual(
        expect.objectContaining({ kind: "authentication", userId: undefined }),
      );
    } finally {
      await database.stop();
    }
  });
});
