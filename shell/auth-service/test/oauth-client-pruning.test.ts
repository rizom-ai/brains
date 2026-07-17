import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  AuthRuntimeDatabase,
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
      const user = await new AuthUserStore(database.db).ensureFirstAnchorUser();
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
});
