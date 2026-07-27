import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthCredentialStore } from "../src/credential-store";
import { resetAuthPasskeysStorage } from "../src/passkey-reset";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { RuntimeAuthSessionStore } from "../src/session-store";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("resetAuthPasskeysStorage", () => {
  it("rolls back every reset deletion when one table cannot be cleared", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-passkey-reset-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    const user = await new AuthUserStore(database.db).createUser({
      displayName: "Recovery Admin",
      role: "admin",
    });
    await new AuthCredentialStore(database.db).addPasskey({
      id: "credential-1",
      userId: user.id,
      publicKey: "public-key",
      counter: 0,
      credentialBackedUp: false,
    });
    await new RuntimeAuthSessionStore(database).createSession(user.id);
    await database.client.execute(`
      CREATE TRIGGER reject_auth_session_reset
      BEFORE DELETE ON auth_sessions
      BEGIN
        SELECT RAISE(ABORT, 'session reset rejected');
      END
    `);
    await database.stop();

    let resetError: unknown;
    try {
      await resetAuthPasskeysStorage(storageDir);
    } catch (error) {
      resetError = error;
    }
    expect(resetError).toBeInstanceOf(Error);

    const reopened = new AuthRuntimeDatabase({ storageDir });
    await reopened.start();
    try {
      const passkeys = await reopened.client.execute(
        "SELECT COUNT(*) AS count FROM passkey_credentials",
      );
      const sessions = await reopened.client.execute(
        "SELECT COUNT(*) AS count FROM auth_sessions",
      );
      expect(Number(passkeys.rows[0]?.["count"])).toBe(1);
      expect(Number(sessions.rows[0]?.["count"])).toBe(1);
    } finally {
      await reopened.client.execute("DROP TRIGGER reject_auth_session_reset");
      await reopened.stop();
    }
  });
});
