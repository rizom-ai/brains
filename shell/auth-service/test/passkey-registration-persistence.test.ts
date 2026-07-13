import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAuditStore, AuthRuntimeDatabase, AuthUserStore } from "../src";
import { RuntimePasskeyStore } from "../src/credential-store";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-passkey-registration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("runtime passkey registration persistence", () => {
  it("creates a verified identity binding and audit event", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const users = new AuthUserStore(database.db);
      const user = await users.ensureFirstAnchorUser();
      const store = new RuntimePasskeyStore(database);
      await store.addCredential({
        id: "new-credential",
        public_key: "public-key",
        counter: 0,
        transports: ["internal"],
        subject: user.id,
        user_name: user.displayName,
        credential_device_type: "singleDevice",
        credential_backed_up: false,
        created_at: 1_700_000_000,
        updated_at: 1_700_000_000,
      });

      expect(
        await users.resolveIdentity({
          type: "passkey",
          subject: "new-credential",
        }),
      ).toMatchObject({ id: user.id });
      expect(
        (await new AuthAuditStore(database.db).list()).map((event) => ({
          action: event.action,
          targetId: event.targetId,
          metadata: event.metadata,
        })),
      ).toContainEqual({
        action: "auth.passkey.registered",
        targetId: "new-credential",
        metadata: { userId: user.id },
      });
    } finally {
      await database.stop();
    }
  });
});
