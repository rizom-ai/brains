import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService } from "../src";
import { SetupStateStore, setupTokenId } from "../src/setup-state-store";

const tempDirs: string[] = [];
const recipient = "anchor@example.com";

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-setup-token-migration-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy setup token migration", () => {
  it("preserves delivered links using only hashes after restart", async () => {
    const storageDir = await tempStorageDir();
    const rawToken = "setup_legacy-delivered-token";
    const setupTokenIdValue = setupTokenId(rawToken);
    const legacyStore = new SetupStateStore({ storageDir });
    await legacyStore.saveSetupToken({
      token: rawToken,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    await legacyStore.recordDelivery(setupTokenIdValue, recipient, {
      deliveryId: "email_1",
    });
    const legacyPath = join(storageDir, "oauth-setup-state.json");
    const legacyBefore = await readFile(legacyPath, "utf8");

    const first = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await first.initialize();
    const setupUrl = first.getSetupUrl();
    if (!setupUrl) throw new Error("Expected migrated setup URL");
    await first.close();
    const database = createClient({
      url: `file:${join(storageDir, "auth.db")}`,
    });
    try {
      const rows = await database.execute(
        `SELECT token_hash, delivery_key_hash, consumed_at
          FROM setup_tokens`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.["token_hash"]).not.toBe(rawToken);
      expect(rows.rows[0]?.["delivery_key_hash"]).not.toBe(recipient);
      expect(rows.rows[0]?.["consumed_at"]).toBeNull();
    } finally {
      database.close();
    }
    expect(await readFile(legacyPath, "utf8")).toBe(legacyBefore);
    await rm(legacyPath);

    const second = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await second.initialize();
    try {
      expect(second.getSetupUrl()).toBeUndefined();
      const response = await second.handleRequest(new Request(setupUrl));
      expect(response.status).toBe(200);
      expect(
        await second.hasSetupEmailDelivery(setupTokenIdValue, recipient),
      ).toBe(true);

      expect(await second.getPasskeySetupRequired()).toBeUndefined();
      expect((await second.handleRequest(new Request(setupUrl))).status).toBe(
        200,
      );
    } finally {
      await second.close();
    }
  });
});
