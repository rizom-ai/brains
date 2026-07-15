import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService, AuthSessionStore } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-session-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy browser session migration", () => {
  it("imports sessions once without modifying JSON or invalidating cookies", async () => {
    const storageDir = await tempStorageDir();
    const legacyStore = new AuthSessionStore({ storageDir });
    const legacySession = await legacyStore.createSession("single-operator", {
      secure: true,
    });
    const backupPath = join(storageDir, "oauth-sessions.json");
    const backupBefore = await readFile(backupPath, "utf8");

    const first = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await first.initialize();
    await first.close();

    const client = createClient({ url: `file:${join(storageDir, "auth.db")}` });
    try {
      const rows = await client.execute(
        "SELECT user_id, expires_at, revoked_at FROM auth_sessions",
      );
      expect(rows.rows).toHaveLength(1);
      expect(String(rows.rows[0]?.["user_id"])).toStartWith("usr_");
      expect(rows.rows[0]?.["expires_at"]).toBe(legacySession.expiresAt);
      expect(rows.rows[0]?.["revoked_at"]).toBeNull();
      const legacyTable = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'anchor_sessions'",
      );
      expect(legacyTable.rows).toHaveLength(0);
    } finally {
      client.close();
    }
    expect(await readFile(backupPath, "utf8")).toBe(backupBefore);
    await rm(backupPath);

    const second = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await second.initialize();
    try {
      expect(
        await second.resolveSession(
          new Request("https://brain.example.com/dashboard", {
            headers: { cookie: legacySession.cookie },
          }),
        ),
      ).toMatchObject({
        userId: expect.stringMatching(/^usr_/),
        permissionLevel: "anchor",
      });
    } finally {
      await second.close();
    }
  });
});
