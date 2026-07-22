import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthIdentityStore } from "../src/identity-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { setupTokenDeliveries, setupTokens } from "../src/runtime-schema";
import {
  setupDeliveryRecipientHash,
  setupTokenId,
} from "../src/setup-state-store";
import { TargetedSetupService } from "../src/targeted-setup-service";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("TargetedSetupService", () => {
  it("atomically verifies delivery, activates the user, and consumes the token", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-targeted-setup-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const identities = new AuthIdentityStore(database.db);
      const service = new TargetedSetupService(database.db, identities);
      const user = await users.createUser({
        displayName: "Invited Person",
        role: "trusted",
        status: "invited",
      });
      const identity = await identities.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "invited@example.com",
        deliverySubject: "invited@example.com",
        source: { kind: "admin" },
      });
      const tokenHash = setupTokenId("setup_delivered");
      const now = Math.floor(Date.now() / 1000);
      await database.db.insert(setupTokens).values({
        tokenHash,
        purpose: "passkey_setup",
        targetUserId: user.id,
        deliveryClaimId: identity.id,
        expiresAt: now + 60,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: now,
      });
      await database.db.insert(setupTokenDeliveries).values({
        tokenHash,
        recipientHash: setupDeliveryRecipientHash("invited@example.com"),
        deliveredAt: now,
        deliveryId: "email_1",
      });

      const completed = await service.complete({
        userId: user.id,
        setupTokenId: tokenHash,
      });

      expect(completed).toMatchObject({
        user: { id: user.id, status: "active" },
        boundIdentity: { id: identity.id, verifiedAt: expect.any(Number) },
      });
      expect((await database.db.select().from(setupTokens))[0]).toMatchObject({
        tokenHash,
        consumedAt: expect.any(Number),
      });
    } finally {
      await database.stop();
    }
  });
});
