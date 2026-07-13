import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { A2APeerTrustStore, AuthService } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-peer-trust-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy A2A peer trust migration", () => {
  it("imports grants once, preserves JSON, and serves them from the database", async () => {
    const storageDir = await tempStorageDir();
    await new A2APeerTrustStore({ storageDir }).grant({
      domain: "PEER.EXAMPLE.COM",
      keyFingerprint: "sha256:peer-key",
      grantedLevel: "trusted",
    });
    const backupPath = join(storageDir, "a2a-peer-trust.json");
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
        `SELECT domain, key_fingerprint, granted_level
          FROM a2a_peer_trust`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        domain: "peer.example.com",
        key_fingerprint: "sha256:peer-key",
        granted_level: "trusted",
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
      expect(await second.getA2APeerTrust("PEER.EXAMPLE.COM")).toEqual({
        domain: "peer.example.com",
        keyFingerprint: "sha256:peer-key",
        grantedLevel: "trusted",
      });
      await second.revokeA2APeerTrust("peer.example.com");
      expect(await second.getA2APeerTrust("peer.example.com")).toBeUndefined();
    } finally {
      await second.close();
    }
  });
});
