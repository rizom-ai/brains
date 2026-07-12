import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthCredentialStore,
  AuthRuntimeDatabase,
  AuthUserStore,
} from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-credential-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthCredentialStore", () => {
  it("stores, updates, and revokes passkey credentials", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const user = await new AuthUserStore(database.db).ensureFirstAnchorUser();
      const store = new AuthCredentialStore(database.db);
      await store.addPasskey({
        id: "credential-id",
        userId: user.id,
        publicKey: "public-key",
        counter: 1,
        transports: ["internal", "hybrid"],
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      });

      expect(await store.getPasskey("credential-id")).toMatchObject({
        id: "credential-id",
        userId: user.id,
        counter: 1,
        transports: ["internal", "hybrid"],
        credentialBackedUp: true,
      });
      await store.updatePasskeyCounter("credential-id", 2);
      expect(await store.getPasskey("credential-id")).toMatchObject({
        counter: 2,
      });
      expect(await store.listPasskeys(user.id)).toHaveLength(1);

      await store.revokePasskey("credential-id");
      expect(await store.getPasskey("credential-id")).toBeUndefined();
      expect(await store.listPasskeys(user.id)).toEqual([]);
    } finally {
      await database.stop();
    }
  });

  it("stores hashed one-use WebAuthn challenges with optional users", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const user = await new AuthUserStore(database.db).ensureFirstAnchorUser();
      const store = new AuthCredentialStore(database.db);
      const now = Date.now();

      await store.saveChallenge({
        challenge: "registration-secret",
        kind: "registration",
        userId: user.id,
        expiresAt: now + 60_000,
      });
      await store.saveChallenge({
        challenge: "authentication-secret",
        kind: "authentication",
        expiresAt: now + 60_000,
      });

      expect(
        await store.consumeChallenge(
          "registration-secret",
          "registration",
          now,
        ),
      ).toMatchObject({ userId: user.id, kind: "registration" });
      expect(
        await store.consumeChallenge(
          "registration-secret",
          "registration",
          now,
        ),
      ).toBeUndefined();
      expect(
        await store.consumeChallenge(
          "authentication-secret",
          "authentication",
          now,
        ),
      ).toMatchObject({ userId: undefined, kind: "authentication" });

      const rows = await database.client.execute({
        sql: "SELECT challenge_hash, user_id FROM webauthn_challenges ORDER BY created_at",
        args: [],
      });
      expect(rows.rows[0]?.["challenge_hash"]).not.toBe("registration-secret");
      expect(rows.rows[1]?.["challenge_hash"]).not.toBe(
        "authentication-secret",
      );
      expect(rows.rows[1]?.["user_id"]).toBeNull();
    } finally {
      await database.stop();
    }
  });
});
