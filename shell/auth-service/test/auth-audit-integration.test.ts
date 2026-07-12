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
