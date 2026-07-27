import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthIdentityStore } from "../src/identity-store";
import {
  authInvitationDeliveryAttempts,
  authInvitations,
} from "../src/invitation-schema";
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
      await database.db.insert(authInvitations).values({
        id: "inv_1",
        userId: user.id,
        deliveryClaimId: identity.id,
        currentSetupTokenHash: tokenHash,
        createdByUserId: null,
        idempotencyKeyHash: "request_hash",
        state: "sent",
        failureCode: null,
        createdAt: now * 1000,
        updatedAt: now * 1000,
        sentAt: now * 1000,
        claimedAt: null,
        expiredAt: null,
        cancelledAt: null,
      });
      await database.db.insert(authInvitationDeliveryAttempts).values({
        id: "ida_1",
        invitationId: "inv_1",
        setupTokenHash: tokenHash,
        providerId: "email",
        providerDeliveryId: "email_1",
        state: "sent",
        failureCode: null,
        queuedAt: now * 1000,
        startedAt: now * 1000,
        completedAt: now * 1000,
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
      expect(
        (await database.db.select().from(authInvitations))[0],
      ).toMatchObject({
        id: "inv_1",
        state: "claimed",
        claimedAt: expect.any(Number),
      });
    } finally {
      await database.stop();
    }
  });
});
