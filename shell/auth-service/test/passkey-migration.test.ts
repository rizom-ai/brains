import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService, PasskeyStore } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-passkey-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy passkey migration", () => {
  it("revokes a migrated passkey, its user sessions, and records audit", async () => {
    const storageDir = await tempStorageDir();
    await new PasskeyStore({ storageDir }).addCredential({
      id: "legacy-credential",
      public_key: "legacy-public-key",
      counter: 7,
      subject: "single-operator",
      user_name: "Operator",
      credential_device_type: "multiDevice",
      credential_backed_up: true,
      created_at: 1_700_000_000,
      updated_at: 1_700_000_001,
    });
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await service.initialize();
    const session = await service.createAuthSession();
    const request = new Request("https://brain.example.com/dashboard", {
      headers: { cookie: session.cookie },
    });

    await service.revokePasskey("legacy-credential");

    expect(await service.hasPasskeyCredentials()).toBe(false);
    expect(await service.resolveSession(request)).toBeUndefined();
    expect(
      await service.resolveIdentity({
        type: "passkey",
        subject: "legacy-credential",
      }),
    ).toBeUndefined();
    expect(
      (await service.listAuditEvents()).map((event) => event.action),
    ).toContain("auth.passkey.revoked");
    await service.close();

    const restarted = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await restarted.initialize();
    expect(await restarted.hasPasskeyCredentials()).toBe(false);
    await restarted.close();
  });

  it("authenticates from the database after the legacy backup is unavailable", async () => {
    const storageDir = await tempStorageDir();
    await new PasskeyStore({ storageDir }).addCredential({
      id: "legacy-credential",
      public_key: "legacy-public-key",
      counter: 7,
      transports: ["internal"],
      subject: "single-operator",
      user_name: "Operator",
      credential_device_type: "multiDevice",
      credential_backed_up: true,
      created_at: 1_700_000_000,
      updated_at: 1_700_000_001,
    });

    const first = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await first.initialize();
    await first.close();
    await rm(join(storageDir, "oauth-passkeys.json"));

    const second = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await second.initialize();
    try {
      expect(await second.hasPasskeyCredentials()).toBe(true);
      const response = await second.handleRequest(
        new Request("https://brain.example.com/webauthn/auth/options", {
          method: "POST",
        }),
      );
      expect(response.status).toBe(200);
      const challenges = createClient({
        url: `file:${join(storageDir, "auth.db")}`,
      });
      try {
        const rows = await challenges.execute(
          "SELECT challenge_hash FROM webauthn_challenges",
        );
        expect(rows.rows).toHaveLength(1);
      } finally {
        challenges.close();
      }
    } finally {
      await second.close();
    }
  });

  it("imports legacy credentials once without modifying the JSON backup", async () => {
    const storageDir = await tempStorageDir();
    await new PasskeyStore({ storageDir }).addCredential({
      id: "legacy-credential",
      public_key: "legacy-public-key",
      counter: 7,
      transports: ["internal"],
      subject: "single-operator",
      user_name: "Operator",
      credential_device_type: "multiDevice",
      credential_backed_up: true,
      created_at: 1_700_000_000,
      updated_at: 1_700_000_001,
    });
    const backupPath = join(storageDir, "oauth-passkeys.json");
    const backupBefore = await readFile(backupPath, "utf8");

    const first = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await first.initialize();
    await first.close();

    const second = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await second.initialize();
    await second.close();

    const client = createClient({ url: `file:${join(storageDir, "auth.db")}` });
    try {
      const rows = await client.execute({
        sql: `SELECT id, user_id, counter, transports_json,
          credential_device_type, credential_backed_up
          FROM passkey_credentials`,
        args: [],
      });
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        id: "legacy-credential",
        counter: 7,
        transports_json: '["internal"]',
        credential_device_type: "multiDevice",
        credential_backed_up: 1,
      });
      const userId = String(rows.rows[0]?.["user_id"]);
      expect(userId).toStartWith("usr_");

      const identities = await client.execute({
        sql: `SELECT user_id, type, identity_key_hash, verified_at
          FROM auth_identities WHERE revoked_at IS NULL`,
        args: [],
      });
      expect(identities.rows).toHaveLength(1);
      expect(identities.rows[0]).toMatchObject({
        user_id: userId,
        type: "passkey",
      });
      expect(identities.rows[0]?.["identity_key_hash"]).not.toBe(
        "passkey:legacy-credential",
      );
      expect(identities.rows[0]?.["verified_at"]).not.toBeNull();
      expect(await readFile(backupPath, "utf8")).toBe(backupBefore);
    } finally {
      client.close();
    }
  });
});
