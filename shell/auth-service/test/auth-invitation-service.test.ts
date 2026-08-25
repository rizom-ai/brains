import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryProvider,
  ChannelDeliveryResult,
  ChannelDescriptor,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { AuthAuditStore } from "../src/audit-store";
import { AuthService } from "../src/auth-service";
import { AuthInvitationService } from "../src/invitation-service";
import { setupTokenDeliveries, setupTokens } from "../src/runtime-schema";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

function getEmailDeliveryProvider(
  send: (input: ChannelDeliveryInput) => Promise<ChannelDeliveryResult>,
  available = true,
): (channelType: string) => ChannelDeliveryProvider | undefined {
  const provider: ChannelDeliveryProvider = {
    channelType: "email",
    isAvailable: async () => available,
    send,
  };
  return (channelType) => (channelType === "email" ? provider : undefined);
}

async function rejectionMessage(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
    return "";
  } catch (error) {
    return getErrorMessage(error);
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createFixture(): Promise<{
  admin: Awaited<ReturnType<AuthUserStore["ensureFirstAdminUser"]>>;
  database: AuthRuntimeDatabase;
  storageDir: string;
  users: AuthUserStore;
}> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-invitations-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  const users = new AuthUserStore(database.db);
  const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });
  return { admin, database, storageDir, users };
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
      getDeliveryProvider: getEmailDeliveryProvider(async (input) => {
        deliveries.push({
          to: input.recipient,
          idempotencyKey: input.idempotencyKey,
        });
        return { status: "sent", providerDeliveryId: "email_1" };
      }),
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

  it("rejects unavailable email delivery before creating durable state", async () => {
    const { admin, database, users } = await createFixture();
    let sendCount = 0;
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async () => {
        sendCount += 1;
        return { status: "sent" };
      }, false),
    });

    expect(
      await rejectionMessage(
        service.create({
          idempotencyKey: "unavailable-request-1",
          displayName: "Mira Reyes",
          role: "trusted",
          delivery: { type: "email", subject: "mira@example.com" },
          actorUserId: admin.id,
        }),
      ),
    ).toBe("Invitation delivery provider is unavailable");

    expect(await users.listUsers()).toHaveLength(1);
    expect(await service.list()).toEqual([]);
    expect(await database.db.select().from(setupTokens)).toEqual([]);
    expect(sendCount).toBe(0);
    await database.stop();
  });

  it("rejects providerless non-email delivery without creating durable state", async () => {
    const { admin, database, users } = await createFixture();
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
    });

    expect(
      await rejectionMessage(
        service.create({
          idempotencyKey: "providerless-discord-request-1",
          displayName: "Mira Reyes",
          role: "trusted",
          delivery: {
            type: "discord",
            subject: "1442828818493735015",
            label: "@mira",
          },
          actorUserId: admin.id,
        }),
      ),
    ).toBe("Invitation delivery provider is unavailable");

    expect(await users.listUsers()).toHaveLength(1);
    expect(await service.list()).toEqual([]);
    expect(await database.db.select().from(setupTokens)).toEqual([]);
    await database.stop();
  });

  it("keeps explicit manual delivery pending until an idempotent Admin confirmation", async () => {
    const { admin, database } = await createFixture();
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      getChannelDescriptor: (channelType): ChannelDescriptor | undefined =>
        channelType === "discord"
          ? {
              type: "discord",
              displayName: "Discord",
              subjectLabel: "Discord user ID",
              manualDelivery: true,
            }
          : undefined,
    });

    const created = await service.create({
      idempotencyKey: "manual-discord-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: {
        type: "discord",
        subject: "1442828818493735015",
        label: "@mira",
        mode: "manual",
      },
      actorUserId: admin.id,
    });
    const firstAttemptId = created.registration?.deliveryAttemptId;
    if (!firstAttemptId) throw new Error("Expected a manual delivery attempt");

    expect(created.invitation).toMatchObject({ state: "pending" });
    expect(await database.db.select().from(setupTokenDeliveries)).toEqual([]);
    expect(await service.listDeliveryAttempts(created.invitation.id)).toEqual([
      expect.objectContaining({ id: firstAttemptId, state: "queued" }),
    ]);

    const [confirmed, replayedConfirmation] = await Promise.all([
      service.confirmManualDelivery(
        created.invitation.id,
        firstAttemptId,
        admin.id,
      ),
      service.confirmManualDelivery(
        created.invitation.id,
        firstAttemptId,
        admin.id,
      ),
    ]);
    expect(confirmed).toMatchObject({ state: "sent" });
    expect(replayedConfirmation).toMatchObject({ state: "sent" });
    expect(await database.db.select().from(setupTokenDeliveries)).toHaveLength(
      1,
    );

    const resent = await service.resend(created.invitation.id, admin.id);
    const secondAttemptId = resent.registration?.deliveryAttemptId;
    if (!secondAttemptId) throw new Error("Expected a replacement attempt");
    expect(resent.invitation).toMatchObject({ state: "pending" });
    expect(secondAttemptId).not.toBe(firstAttemptId);
    expect(
      await rejectionMessage(
        service.confirmManualDelivery(
          created.invitation.id,
          firstAttemptId,
          admin.id,
        ),
      ),
    ).toBe("Manual delivery attempt is no longer current");
    expect(
      await service.confirmManualDelivery(
        created.invitation.id,
        secondAttemptId,
        admin.id,
      ),
    ).toMatchObject({ state: "sent" });
    expect(await database.db.select().from(setupTokenDeliveries)).toHaveLength(
      2,
    );
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
      getDeliveryProvider: getEmailDeliveryProvider(async () => ({
        status: "failed",
        failureCode: "provider_rejected",
      })),
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
      getDeliveryProvider: getEmailDeliveryProvider(async () => ({
        status: "sent",
      })),
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

  it("recovers interrupted delivery by invalidating the old link and dispatching a new attempt", async () => {
    const { admin, database } = await createFixture();
    let markDispatchStarted: (() => void) | undefined;
    const dispatchStarted = new Promise<void>((resolve) => {
      markDispatchStarted = resolve;
    });
    let completeInterruptedDispatch:
      ((result: ChannelDeliveryResult) => void) | undefined;
    const interruptedDispatch = new Promise<ChannelDeliveryResult>(
      (resolve) => {
        completeInterruptedDispatch = resolve;
      },
    );
    const interrupted = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      deliveryRecoveryStaleMs: 1,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async () => {
        markDispatchStarted?.();
        return interruptedDispatch;
      }),
    });
    const interruptedCreation = interrupted.create({
      idempotencyKey: "interrupted-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });
    await dispatchStarted;
    const [before] = await interrupted.list();
    if (!before) throw new Error("Expected an interrupted invitation");

    let recoveredSendCount = 0;
    const recovered = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      deliveryRecoveryStaleMs: 1,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async () => {
        recoveredSendCount += 1;
        return {
          status: "sent",
          providerDeliveryId: "email_recovered",
        };
      }),
    });

    const recoveryCounts = await Promise.all(
      Array.from({ length: 10 }, () =>
        recovered.recoverInterruptedDeliveries(Date.now() + 10),
      ),
    );
    expect(new Set(recoveryCounts)).toEqual(new Set([1]));
    expect(recoveredSendCount).toBe(1);

    const [after] = await recovered.list();
    expect(after).toMatchObject({
      id: before.id,
      state: "sent",
      failureCode: null,
    });
    expect(after?.currentSetupTokenHash).not.toBe(before.currentSetupTokenHash);
    expect(await recovered.listDeliveryAttempts(before.id)).toEqual([
      expect.objectContaining({
        state: "failed",
        failureCode: "delivery_interrupted",
      }),
      expect.objectContaining({
        state: "sent",
        providerDeliveryId: "email_recovered",
      }),
    ]);
    const tokens = await database.db.select().from(setupTokens);
    expect(
      tokens.find((token) => token.tokenHash === before.currentSetupTokenHash),
    ).toMatchObject({ consumedAt: expect.any(Number) });
    expect(
      tokens.find((token) => token.tokenHash === after?.currentSetupTokenHash),
    ).toMatchObject({ consumedAt: null });

    completeInterruptedDispatch?.({
      status: "sent",
      providerDeliveryId: "email_late_original",
    });
    await interruptedCreation;
    expect(await recovered.listDeliveryAttempts(before.id)).toEqual([
      expect.objectContaining({
        state: "failed",
        failureCode: "delivery_interrupted",
      }),
      expect.objectContaining({
        state: "sent",
        providerDeliveryId: "email_recovered",
      }),
    ]);
    await database.stop();
  });

  it("recovers interrupted deliveries through the AuthService lifecycle", async () => {
    const { admin, database, storageDir } = await createFixture();
    let markDispatchStarted: (() => void) | undefined;
    const dispatchStarted = new Promise<void>((resolve) => {
      markDispatchStarted = resolve;
    });
    const interrupted = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async () => {
        markDispatchStarted?.();
        return new Promise<ChannelDeliveryResult>(() => undefined);
      }),
    });
    void interrupted.create({
      idempotencyKey: "lifecycle-recovery-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });
    await dispatchStarted;
    await database.stop();
    await Bun.sleep(5);

    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
      autoStartInvitationDeliveryRecovery: false,
      invitationDeliveryRecoveryIntervalMs: 60_000,
      invitationDeliveryRecoveryStaleMs: 1,
      getInvitationDeliveryProvider: getEmailDeliveryProvider(async () => ({
        status: "sent",
        providerDeliveryId: "email_lifecycle_recovered",
      })),
    });
    await service.initialize();
    expect(await service.listAdminUsers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Mira Reyes",
          invitation: expect.objectContaining({
            state: "sending",
            expiresAt: expect.any(Number),
          }),
        }),
      ]),
    );

    await service.startInvitationDeliveryRecovery();
    expect(await service.listAdminUsers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Mira Reyes",
          invitation: expect.objectContaining({ state: "sent" }),
        }),
      ]),
    );
    await service.close();
  });

  it("resends with one new token and keeps the old link consumed", async () => {
    const { admin, database } = await createFixture();
    const deliveries: string[] = [];
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async (input) => {
        deliveries.push(input.idempotencyKey);
        return { status: "sent" };
      }),
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

  it("does not revive a cancelled invitation when provider acceptance arrives late", async () => {
    const { admin, database } = await createFixture();
    let markDispatchStarted: (() => void) | undefined;
    let completeDispatch: ((result: ChannelDeliveryResult) => void) | undefined;
    const dispatchStarted = new Promise<void>((resolve) => {
      markDispatchStarted = resolve;
    });
    const dispatch = new Promise<ChannelDeliveryResult>((resolve) => {
      completeDispatch = resolve;
    });
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async () => {
        markDispatchStarted?.();
        return dispatch;
      }),
    });
    const creation = service.create({
      idempotencyKey: "cancel-during-delivery-request-1",
      displayName: "Mira Reyes",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
      actorUserId: admin.id,
    });
    await dispatchStarted;
    const [sending] = await service.list();
    if (!sending) throw new Error("Expected a sending invitation");

    await service.cancel(sending.id, admin.id);
    completeDispatch?.({
      status: "sent",
      providerDeliveryId: "email_late",
    });
    const completed = await creation;

    expect(completed.invitation).toMatchObject({
      state: "cancelled",
      cancelledAt: expect.any(Number),
    });
    expect((await service.list())[0]).toMatchObject({ state: "cancelled" });
    expect(await database.db.select().from(setupTokenDeliveries)).toEqual([]);
    await database.stop();
  });

  it("cancels an invitation and consumes its setup token permanently", async () => {
    const { admin, database, users } = await createFixture();
    const service = new AuthInvitationService({
      db: database.db,
      issuer: "https://brain.example.com",
      setupTokenTtlSeconds: 86_400,
      audit: new AuthAuditStore(database.db),
      getDeliveryProvider: getEmailDeliveryProvider(async () => ({
        status: "sent",
      })),
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
