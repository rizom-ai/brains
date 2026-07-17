import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService } from "../src";
import { LEGACY_AUTH_FILES_IMPORT } from "../src/legacy-import-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { authLegacyImports, setupTokens } from "../src/runtime-schema";
import { SetupStateStore, setupTokenId } from "../src/setup-state-store";

const tempDirs: string[] = [];
const recipient = "anchor@example.com";
const secondRecipient = "backup@example.com";

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
    await legacyStore.recordDelivery(setupTokenIdValue, secondRecipient, {
      deliveryId: "email_2",
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
      const deliveries = await database.execute(
        `SELECT token_hash, recipient_hash, delivery_id
          FROM setup_token_deliveries
          ORDER BY delivery_id`,
      );
      expect(deliveries.rows).toHaveLength(2);
      expect(deliveries.rows.map((row) => row["delivery_id"])).toEqual([
        "email_1",
        "email_2",
      ]);
      expect(
        deliveries.rows.some(
          (row) =>
            row["recipient_hash"] === recipient ||
            row["recipient_hash"] === secondRecipient,
        ),
      ).toBe(false);
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
      expect(
        await second.hasSetupEmailDelivery(setupTokenIdValue, secondRecipient),
      ).toBe(true);

      expect(await second.getPasskeySetupRequired()).toBeUndefined();
      expect((await second.handleRequest(new Request(setupUrl))).status).toBe(
        200,
      );
    } finally {
      await second.close();
    }
  });

  it("backfills every legacy recipient after the broad legacy import completed", async () => {
    const storageDir = await tempStorageDir();
    const rawToken = "setup_pre-normalized-deliveries";
    const setupTokenIdValue = setupTokenId(rawToken);
    const legacyStore = new SetupStateStore({ storageDir });
    await legacyStore.saveSetupToken({
      token: rawToken,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    await legacyStore.recordDelivery(setupTokenIdValue, recipient, {
      deliveryId: "email_1",
    });
    await legacyStore.recordDelivery(setupTokenIdValue, secondRecipient, {
      deliveryId: "email_2",
    });

    const runtimeDatabase = new AuthRuntimeDatabase({ storageDir });
    await runtimeDatabase.start();
    await runtimeDatabase.db.insert(setupTokens).values({
      tokenHash: setupTokenIdValue,
      purpose: "passkey_setup",
      targetUserId: null,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      consumedAt: null,
      deliveryKeyHash: null,
      createdAt: Math.floor(Date.now() / 1000),
    });
    await runtimeDatabase.db.insert(authLegacyImports).values({
      source: LEGACY_AUTH_FILES_IMPORT,
      completedAt: Date.now(),
    });
    await runtimeDatabase.stop();

    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await service.initialize();
    try {
      expect(
        await service.hasSetupEmailDelivery(setupTokenIdValue, recipient),
      ).toBe(true);
      expect(
        await service.hasSetupEmailDelivery(setupTokenIdValue, secondRecipient),
      ).toBe(true);
    } finally {
      await service.close();
    }
  });

  it("retains delivery dedupe for every recipient on one runtime token", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await service.initialize();
    try {
      const setup = await service.getPasskeySetupRequiredForDelivery();
      if (!setup) throw new Error("Expected setup delivery state");

      await service.recordSetupEmailDelivery(setup.setupTokenId, recipient, {
        deliveryId: "email_1",
      });
      await service.recordSetupEmailDelivery(
        setup.setupTokenId,
        secondRecipient,
        { deliveryId: "email_2" },
      );

      expect(
        await service.hasSetupEmailDelivery(setup.setupTokenId, recipient),
      ).toBe(true);
      expect(
        await service.hasSetupEmailDelivery(
          setup.setupTokenId,
          secondRecipient,
        ),
      ).toBe(true);
    } finally {
      await service.close();
    }
  });
});
