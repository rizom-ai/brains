import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService, AuthorizationCodeStore, OAuthClientStore } from "../src";

const tempDirs: string[] = [];
const verifier =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-code-migration-"));
  tempDirs.push(dir);
  return dir;
}

async function pkceChallenge(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(digest).toString("base64url");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy authorization code migration", () => {
  it("imports active codes hashed and preserves one-use exchange", async () => {
    const storageDir = await tempStorageDir();
    const client = await new OAuthClientStore({ storageDir }).registerClient({
      redirect_uris: ["https://client.example.com/callback"],
    });
    const code = await new AuthorizationCodeStore({ storageDir }).createCode({
      clientId: client.client_id,
      redirectUri: "https://client.example.com/callback",
      codeChallenge: await pkceChallenge(verifier),
      scope: "mcp",
      subject: "single-operator",
    });
    const backupPath = join(storageDir, "oauth-auth-codes.json");
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
        "SELECT code_hash, client_id, user_id FROM oauth_auth_codes",
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.["code_hash"]).not.toBe(code.code);
      expect(rows.rows[0]?.["client_id"]).toBe(client.client_id);
      expect(String(rows.rows[0]?.["user_id"])).toStartWith("usr_");
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
      const tokenRequest = (): Request =>
        new Request("https://brain.example.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: client.client_id,
            redirect_uri: code.redirect_uri,
            code: code.code,
            code_verifier: verifier,
          }),
        });
      const exchanged = await second.handleRequest(tokenRequest());
      expect(exchanged.status).toBe(200);
      expect(await exchanged.json()).toMatchObject({
        token_type: "Bearer",
        scope: "mcp",
      });

      const replayed = await second.handleRequest(tokenRequest());
      expect(await replayed.json()).toMatchObject({ error: "invalid_grant" });
    } finally {
      await second.close();
    }
  });
});
