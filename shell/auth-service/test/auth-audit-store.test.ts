import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAuditStore, AuthRuntimeDatabase } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-audit-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthAuditStore", () => {
  it("appends and lists structured audit events newest first", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const store = new AuthAuditStore(database.db);
      const first = await store.append({
        action: "auth.user.created",
        targetType: "user",
        targetId: "usr_first",
        metadata: { role: "trusted" },
      });
      const second = await store.append({
        action: "auth.identity.attached",
        targetType: "identity",
        targetId: "aid_second",
        metadata: { type: "discord" },
      });

      expect(first.id).toStartWith("aae_");
      expect(await store.list()).toEqual([
        {
          ...second,
          metadata: { type: "discord" },
        },
        {
          ...first,
          metadata: { role: "trusted" },
        },
      ]);
    } finally {
      await database.stop();
    }
  });
});
