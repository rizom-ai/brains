import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthRuntimeDatabase,
  AuthService,
  AuthUserStore,
  OAuthClientStore,
  RefreshTokenStore,
} from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-refresh-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy refresh token migration", () => {
  it("imports user tokens, skips single-operator tokens, and preserves JSON", async () => {
    const storageDir = await tempStorageDir();
    const runtimeDatabase = new AuthRuntimeDatabase({ storageDir });
    await runtimeDatabase.start();
    const user = await new AuthUserStore(runtimeDatabase.db).createUser({
      displayName: "Existing anchor",
      role: "anchor",
    });
    await runtimeDatabase.stop();

    const client = await new OAuthClientStore({ storageDir }).registerClient({
      redirect_uris: ["https://client.example.com/callback"],
    });
    const legacyStore = new RefreshTokenStore({ storageDir });
    const migratable = await legacyStore.issueToken({
      clientId: client.client_id,
      subject: user.id,
      scope: "mcp",
    });
    await legacyStore.issueToken({
      clientId: client.client_id,
      subject: "single-operator",
      scope: "mcp",
    });
    const backupPath = join(storageDir, "oauth-refresh-tokens.json");
    const backupBefore = await readFile(backupPath, "utf8");

    const first = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await first.initialize();
    await first.close();

    const database = createClient({
      url: `file:${join(storageDir, "auth.db")}`,
    });
    try {
      const rows = await database.execute(
        "SELECT token_hash, client_id, user_id, revoked_at FROM oauth_refresh_tokens",
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.["token_hash"]).toBe(migratable.record.token_hash);
      expect(rows.rows[0]?.["client_id"]).toBe(client.client_id);
      expect(rows.rows[0]?.["user_id"]).toBe(user.id);
      expect(rows.rows[0]?.["revoked_at"]).toBeNull();
    } finally {
      database.close();
    }
    expect(await readFile(backupPath, "utf8")).toBe(backupBefore);
    await rm(backupPath);
    await rm(join(storageDir, "oauth-clients.json"));

    const second = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await second.initialize();
    try {
      const response = await second.handleRequest(
        new Request("https://brain.example.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: client.client_id,
            refresh_token: migratable.token,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        token_type: "Bearer",
        scope: "mcp",
        refresh_token: expect.stringMatching(/^ort_/),
      });
    } finally {
      await second.close();
    }
  });
});
