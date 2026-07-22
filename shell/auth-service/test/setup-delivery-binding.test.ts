import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { setupTokens } from "../src/runtime-schema";
import { RuntimeSetupStateStore, setupTokenId } from "../src/setup-state-store";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-setup-delivery-binding-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("targeted setup delivery binding", () => {
  it("persists the intended person claim without storing the raw destination on the token", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const user = await users.createUser({
        displayName: "Mira",
        role: "trusted",
        status: "invited",
      });
      const identity = await users.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "mira@example.com",
        deliverySubject: "mira@example.com",
        label: "mira@example.com",
        source: { kind: "admin" },
      });
      const setupStore = new RuntimeSetupStateStore(database);
      const token = "setup_targeted_delivery";

      await setupStore.saveTargetedSetupToken(
        { token, expiresAt: Math.floor(Date.now() / 1000) + 60 },
        user.id,
        { deliveryClaimId: identity.id },
      );

      expect(
        await setupStore.getSetupTokenTarget(
          token,
          Math.floor(Date.now() / 1000),
        ),
      ).toEqual({
        targetUserId: user.id,
        deliveryClaimId: identity.id,
      });
      const row = await database.client.execute({
        sql: `SELECT delivery_claim_id, delivery_key_hash
              FROM setup_tokens WHERE token_hash = ?`,
        args: [setupTokenId(token)],
      });
      expect(row.rows[0]).toMatchObject({
        delivery_claim_id: identity.id,
        delivery_key_hash: null,
      });
      expect(JSON.stringify(row.rows)).not.toContain("mira@example.com");
      const invalidInsertWasRejected = await Promise.resolve(
        database.db.insert(setupTokens).values({
          tokenHash: setupTokenId("setup_delivery_without_target"),
          purpose: "passkey_setup",
          targetUserId: null,
          deliveryClaimId: identity.id,
          expiresAt: Math.floor(Date.now() / 1000) + 60,
          consumedAt: null,
          deliveryKeyHash: null,
          createdAt: Math.floor(Date.now() / 1000),
        }),
      ).then(
        () => false,
        () => true,
      );
      expect(invalidInsertWasRejected).toBe(true);

      const replacement = "setup_targeted_delivery_replacement";
      await setupStore.saveTargetedSetupToken(
        { token: replacement, expiresAt: Math.floor(Date.now() / 1000) + 60 },
        user.id,
        { deliveryClaimId: identity.id },
      );
      expect(
        await setupStore.getSetupTokenTarget(
          token,
          Math.floor(Date.now() / 1000),
        ),
      ).toBeUndefined();
      expect(
        await setupStore.getSetupTokenTarget(
          replacement,
          Math.floor(Date.now() / 1000),
        ),
      ).toMatchObject({
        targetUserId: user.id,
        deliveryClaimId: identity.id,
      });
    } finally {
      await database.stop();
    }
  });
});
