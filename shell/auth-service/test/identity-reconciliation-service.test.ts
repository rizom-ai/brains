import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthIdentityStore } from "../src/identity-store";
import { IdentityReconciliationService } from "../src/identity-reconciliation-service";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("IdentityReconciliationService", () => {
  it("suggests the unique user owning a verified proposal", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-reconciliation-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const identities = new AuthIdentityStore(database.db);
      const service = new IdentityReconciliationService({ users, identities });
      const user = await users.createUser({ displayName: "Known Person" });
      await identities.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "known@example.com",
        verifiedAt: 100,
        source: { kind: "provider", id: "email" },
      });

      expect(
        await service.reconcile([
          {
            type: "email",
            subject: "KNOWN@example.com",
            label: "Known email",
          },
        ]),
      ).toEqual({
        state: "unique_verified_match",
        suggestedUserId: user.id,
        claims: [
          {
            index: 0,
            type: "email",
            label: "Known email",
            state: "verified_match",
            owner: {
              personId: user.personId,
              userId: user.id,
              displayName: "Known Person",
              status: "active",
            },
          },
        ],
      });
    } finally {
      await database.stop();
    }
  });
});
