import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAuditStore } from "../src/audit-store";
import {
  AuthInvitationService,
  type InvitationEmailResult,
} from "../src/invitation-service";
import { setupTokenDeliveries, setupTokens } from "../src/runtime-schema";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createFixture(): Promise<{
  admin: Awaited<ReturnType<AuthUserStore["ensureFirstAdminUser"]>>;
  database: AuthRuntimeDatabase;
  users: AuthUserStore;
}> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-invitations-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  const users = new AuthUserStore(database.db);
  const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });
  return { admin, database, users };
}

describe("AuthInvitationService", () => {
  it("creates one durable invitation and provider attempt under concurrent retries", async () => {
    const { admin, database, users } = await createFixture();
    const deliveries: Array<{ to: string; idempotencyKey: string }> = [];
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      sendEmail: async (input): Promise<InvitationEmailResult> => {
        deliveries.push({
          to: input.to,
          idempotencyKey: input.idempotencyKey,
        });
        return { status: "sent", deliveryId: "email_1" };
      },
    });
    const request = {
      idempotencyKey: "invite-request-1",
      displayName: "Mira Reyes",
      role: "trusted" as const,
      delivery: { type: "email" as const, subject: "mira@example.com" },
      actorUserId: admin.id,
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.create(request)),
    );

    expect(new Set(results.map((result) => result.invitation.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
    expect(
      (await users.listUsers()).filter((user) => user.status === "invited"),
    ).toHaveLength(1);
    const first = results[0];
    if (!first) throw new Error("Expected an invitation result");
    expect(await service.list()).toEqual([
      expect.objectContaining({
        userId: first.user.id,
        state: "sent",
        sentAt: expect.any(Number),
      }),
    ]);
    expect(await service.listDeliveryAttempts(first.invitation.id)).toEqual([
      expect.objectContaining({
        providerId: "email",
        providerDeliveryId: "email_1",
        state: "sent",
      }),
    ]);
    expect(deliveries).toEqual([
      { to: "mira@example.com", idempotencyKey: expect.any(String) },
    ]);
    await database.stop();
  });

  it("does not confirm delivery or leak secrets when the provider fails", async () => {
    const { admin, database } = await createFixture();
    const audit = new AuthAuditStore(database.db);
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit,
      sendEmail: async (): Promise<InvitationEmailResult> => ({
        status: "failed",
        failureCode: "provider_rejected",
      }),
    });

    const created = await service.create({
      idempotencyKey: "failed-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });

    expect(created.invitation).toMatchObject({
      state: "failed",
      failureCode: "provider_rejected",
    });
    expect(await database.db.select().from(setupTokenDeliveries)).toEqual([]);
    const auditText = JSON.stringify(await audit.list());
    expect(auditText).not.toContain("mira@example.com");
    expect(auditText).not.toContain("/setup?token=");
    await database.stop();
  });

  it("reconciles expired invitations and consumes their setup tokens", async () => {
    const { admin, database } = await createFixture();
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: -1,
      audit: new AuthAuditStore(database.db),
      sendEmail: async (): Promise<InvitationEmailResult> => ({
        status: "sent",
      }),
    });
    const created = await service.create({
      idempotencyKey: "expired-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });

    expect((await service.list())[0]).toMatchObject({
      id: created.invitation.id,
      state: "expired",
      expiredAt: expect.any(Number),
    });
    expect((await database.db.select().from(setupTokens))[0]).toMatchObject({
      consumedAt: expect.any(Number),
    });
    await database.stop();
  });

  it("resends with one new token and keeps the old link consumed", async () => {
    const { admin, database } = await createFixture();
    const deliveries: string[] = [];
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      sendEmail: async (input): Promise<InvitationEmailResult> => {
        deliveries.push(input.idempotencyKey);
        return { status: "sent" };
      },
    });
    const created = await service.create({
      idempotencyKey: "resend-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });

    const resent = await service.resend(created.invitation.id, admin.id);
    const tokens = await database.db.select().from(setupTokens);

    expect(resent.invitation).toMatchObject({ state: "sent" });
    expect(resent.invitation.currentSetupTokenHash).not.toBe(
      created.invitation.currentSetupTokenHash,
    );
    expect(
      tokens.find(
        (token) => token.tokenHash === created.invitation.currentSetupTokenHash,
      ),
    ).toMatchObject({ consumedAt: expect.any(Number) });
    expect(
      tokens.find(
        (token) => token.tokenHash === resent.invitation.currentSetupTokenHash,
      ),
    ).toMatchObject({ consumedAt: null });
    expect(
      await service.listDeliveryAttempts(created.invitation.id),
    ).toHaveLength(2);
    expect(deliveries).toHaveLength(2);
    await database.stop();
  });

  it("cancels an invitation and consumes its setup token permanently", async () => {
    const { admin, database, users } = await createFixture();
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      sendEmail: async (): Promise<InvitationEmailResult> => ({
        status: "sent",
      }),
    });
    const created = await service.create({
      idempotencyKey: "cancel-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });

    const cancelled = await service.cancel(created.invitation.id, admin.id);
    await users.updateUserStatus(created.user.id, "active");

    expect(cancelled).toMatchObject({
      state: "cancelled",
      cancelledAt: expect.any(Number),
    });
    expect((await database.db.select().from(setupTokens))[0]).toMatchObject({
      tokenHash: created.invitation.currentSetupTokenHash,
      consumedAt: expect.any(Number),
    });
    expect((await service.list())[0]).toMatchObject({ state: "cancelled" });
    await database.stop();
  });
});
