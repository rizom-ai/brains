import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-principal-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthService principals", () => {
  it("resolves operator sessions to active auth principals", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const session = await service.createOperatorSession();
    const principal = await service.resolveSession(
      new Request("https://brain.example.com/dashboard", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(principal).toMatchObject({
      userId: session.subject,
      displayName: "Operator",
      role: "anchor",
      status: "active",
      permissionLevel: "anchor",
      canonicalId: `user:${session.subject.slice("usr_".length)}`,
    });
  });

  it("does not resolve missing or suspended session subjects", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const suspended = await service.createUser({
      displayName: "Suspended User",
      role: "trusted",
      status: "suspended",
    });
    const session = await service.createOperatorSession(suspended.userId);

    const principal = await service.resolveSession(
      new Request("https://brain.example.com/dashboard", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(principal).toBeUndefined();
  });

  it("resolves verified identities to active auth principals", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const collaborator = await service.createUser({
      displayName: "Discord Collaborator",
      role: "trusted",
    });

    await service.attachIdentity({
      userId: collaborator.userId,
      type: "discord",
      subject: "1442828818493735015",
      label: "Collaborator on Discord",
      verifiedAt: Date.now(),
    });

    const principal = await service.resolveIdentity({
      type: "discord",
      subject: "1442828818493735015",
    });

    expect(principal).toMatchObject({
      userId: collaborator.userId,
      displayName: "Discord Collaborator",
      role: "trusted",
      status: "active",
      permissionLevel: "trusted",
    });
  });
});
