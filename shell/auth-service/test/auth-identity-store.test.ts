import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthIdentityStore } from "../src/identity-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthIdentityStore", () => {
  it("owns identity claims, evidence, and access resolution independently", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-identities-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const identities = new AuthIdentityStore(database.db);
      const user = await users.createUser({ displayName: "Identity Owner" });

      const identity = await identities.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "OWNER@Example.com",
        verifiedAt: 123,
        source: { kind: "provider", id: "email" },
      });

      expect(identity).toMatchObject({
        personId: user.personId,
        verifiedAt: 123,
      });
      expect(
        await identities.resolveIdentity({
          type: "email",
          subject: "owner@example.com",
        }),
      ).toMatchObject({ id: user.id });
    } finally {
      await database.stop();
    }
  });
});
