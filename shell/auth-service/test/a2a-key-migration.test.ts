import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService } from "../src";
import { A2AKeyStore } from "../src/key-store";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-a2a-key-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy A2A signing-key migration", () => {
  it("imports the private key once and continues without the JWK file", async () => {
    const storageDir = await tempStorageDir();
    const legacyKey = await new A2AKeyStore({ storageDir }).getPrivateJwk();
    const backupPath = join(storageDir, "a2a-signing-key.jwk");
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
        `SELECT kid, purpose, private_jwk, status
          FROM oauth_signing_keys ORDER BY purpose`,
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.map((row) => row["purpose"])).toEqual(["a2a", "oauth"]);
      const a2a = rows.rows.find((row) => row["purpose"] === "a2a");
      expect(a2a).toMatchObject({ kid: legacyKey.kid, status: "active" });
      expect(JSON.parse(String(a2a?.["private_jwk"]))).toMatchObject({
        kid: legacyKey.kid,
        d: legacyKey.d,
      });
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
      expect((await second.getA2ASigningKey()).privateJwk).toEqual(legacyKey);
    } finally {
      await second.close();
    }
  });
});
