import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService, OAuthClientStore } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-oauth-client-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy OAuth client migration", () => {
  it("imports confidential clients with hashed secrets and preserves JSON", async () => {
    const storageDir = await tempStorageDir();
    const legacyStore = new OAuthClientStore({ storageDir });
    const client = await legacyStore.registerClient({
      redirect_uris: ["https://client.example.com/callback"],
      token_endpoint_auth_method: "client_secret_post",
      client_name: "Confidential client",
    });
    const clientSecret = client.client_secret;
    if (!clientSecret) throw new Error("Expected generated client secret");

    const backupPath = join(storageDir, "oauth-clients.json");
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
        "SELECT client_id, secret_hash, metadata_json FROM oauth_clients",
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.["client_id"]).toBe(client.client_id);
      expect(rows.rows[0]?.["secret_hash"]).not.toBe(clientSecret);
      expect(String(rows.rows[0]?.["metadata_json"])).not.toContain(
        clientSecret,
      );
    } finally {
      database.close();
    }
    expect(await readFile(backupPath, "utf8")).toBe(backupBefore);
    await rm(backupPath);

    const second = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await second.initialize();
    try {
      const accepted = await second.handleRequest(
        new Request("https://brain.example.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "unsupported",
            client_id: client.client_id,
            client_secret: clientSecret,
          }),
        }),
      );
      expect(await accepted.json()).toMatchObject({
        error: "unsupported_grant_type",
      });

      const rejected = await second.handleRequest(
        new Request("https://brain.example.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "unsupported",
            client_id: client.client_id,
            client_secret: "wrong-secret",
          }),
        }),
      );
      expect(await rejected.json()).toMatchObject({ error: "invalid_client" });
    } finally {
      await second.close();
    }
  });
});
