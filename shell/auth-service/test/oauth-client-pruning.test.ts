import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  AuthRuntimeDatabase,
  AuthService,
  AuthUserStore,
  RuntimeAuthorizationCodeStore,
  RuntimeOAuthClientStore,
} from "../src";
import { oauthClients } from "../src/runtime-schema";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-oauth-clients-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("RuntimeOAuthClientStore", () => {
  it("prunes stale unconsented registrations without deleting approved clients", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();

    try {
      const user = await new AuthUserStore(database.db).ensureFirstAdminUser();
      const clients = new RuntimeOAuthClientStore(database);
      const stale = await clients.registerClient({
        redirect_uris: ["https://stale.example/callback"],
      });
      const approved = await clients.registerClient({
        redirect_uris: ["https://approved.example/callback"],
      });
      const recent = await clients.registerClient({
        redirect_uris: ["https://recent.example/callback"],
      });
      const now = Math.floor(Date.now() / 1000);
      const oldCreatedAt = now - 8 * 24 * 60 * 60;

      for (const client of [stale, approved]) {
        await database.db
          .update(oauthClients)
          .set({ createdAt: oldCreatedAt, updatedAt: oldCreatedAt })
          .where(eq(oauthClients.clientId, client.client_id));
      }
      await new RuntimeAuthorizationCodeStore(database).createCode({
        clientId: approved.client_id,
        redirectUri: approved.redirect_uris[0] ?? "",
        codeChallenge: "challenge",
        subject: user.id,
      });

      const pruned = await clients.pruneStaleUnconsentedClients(
        now - 7 * 24 * 60 * 60,
      );

      expect(pruned).toBe(1);
      expect(await clients.getClient(stale.client_id)).toBeUndefined();
      expect(await clients.getClient(approved.client_id)).toBeDefined();
      expect(await clients.getClient(recent.client_id)).toBeDefined();
    } finally {
      await database.stop();
    }
  });

  it("prunes on startup without registration traffic", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    const clients = new RuntimeOAuthClientStore(database);
    const staleAtStartup = await clients.registerClient({
      redirect_uris: ["https://startup-stale.example/callback"],
    });
    const oldCreatedAt = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    await database.db
      .update(oauthClients)
      .set({ createdAt: oldCreatedAt, updatedAt: oldCreatedAt })
      .where(eq(oauthClients.clientId, staleAtStartup.client_id));
    await database.stop();

    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    await service.initialize();
    try {
      expect(
        await service.getRegisteredClient(staleAtStartup.client_id),
      ).toBeUndefined();
    } finally {
      await service.close();
    }
  });
});
