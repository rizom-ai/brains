import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-audit-integration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthService audit integration", () => {
  it("audits setup-token generation", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    await service.initialize();

    expect(
      (await service.listAuditEvents()).map((event) => event.action),
    ).toContain("auth.setup_token.generated");
  });

  it("audits automatic first-owner creation", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const session = await service.createOperatorSession();

    expect(
      (await service.listAuditEvents()).map((event) => ({
        action: event.action,
        targetId: event.targetId,
        metadata: event.metadata,
      })),
    ).toEqual([
      {
        action: "auth.user.created",
        targetId: session.subject,
        metadata: { role: "anchor", status: "active" },
      },
    ]);
  });

  it("records the authenticated actor for management mutations", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const owner = await service.createUser({
      displayName: "Owner",
      role: "anchor",
    });
    const context = { actorUserId: owner.userId };
    const user = await service.createUser(
      { displayName: "Collaborator", role: "trusted" },
      context,
    );
    await service.updateUserRole(user.userId, "public", context);
    const identity = await service.attachIdentity(
      {
        userId: user.userId,
        type: "discord",
        subject: "1442828818493735015",
        verifiedAt: Date.now(),
      },
      context,
    );
    await service.detachIdentity(identity.id, context);
    await service.suspendUser(user.userId, context);

    const actorEvents = (await service.listAuditEvents()).filter(
      (event) => event.targetId !== owner.userId,
    );
    expect(actorEvents).toHaveLength(5);
    expect(
      actorEvents.every((event) => event.actorUserId === owner.userId),
    ).toBe(true);
  });

  it("audits A2A peer-trust mutations with the authenticated actor", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const owner = await service.createUser({
      displayName: "Owner",
      role: "anchor",
    });
    const context = { actorUserId: owner.userId };

    await service.grantA2APeerTrust(
      {
        domain: "peer.example.com",
        keyFingerprint: "fingerprint-1",
        grantedLevel: "trusted",
      },
      context,
    );
    await service.revokeA2APeerTrust("peer.example.com", context);

    expect(await service.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: owner.userId,
          action: "auth.a2a_peer_trust.granted",
          targetId: "peer.example.com",
        }),
        expect.objectContaining({
          actorUserId: owner.userId,
          action: "auth.a2a_peer_trust.revoked",
          targetId: "peer.example.com",
        }),
      ]),
    );
  });

  it("audits user and identity mutations", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const user = await service.createUser({
      displayName: "Collaborator",
      role: "trusted",
    });
    await service.updateUserRole(user.userId, "public");
    const identity = await service.attachIdentity({
      userId: user.userId,
      type: "discord",
      subject: "1442828818493735015",
      verifiedAt: Date.now(),
    });
    await service.detachIdentity(identity.id);

    expect(
      (await service.listAuditEvents()).map((event) => ({
        action: event.action,
        targetId: event.targetId,
        metadata: event.metadata,
      })),
    ).toEqual([
      {
        action: "auth.identity.detached",
        targetId: identity.id,
        metadata: { type: "discord", userId: user.userId },
      },
      {
        action: "auth.identity.attached",
        targetId: identity.id,
        metadata: { type: "discord", userId: user.userId },
      },
      {
        action: "auth.user.role_updated",
        targetId: user.userId,
        metadata: { from: "trusted", to: "public" },
      },
      {
        action: "auth.user.created",
        targetId: user.userId,
        metadata: { role: "trusted", status: "active" },
      },
    ]);
  });
});
