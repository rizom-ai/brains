import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthIdentityStore } from "../src/identity-store";
import { AuthPrincipalService } from "../src/principal-service";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import type { AuthUser } from "../src/runtime-schema";
import { RuntimeAuthSessionStore } from "../src/session-store";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthPrincipalService", () => {
  it("owns active session resolution and Anchor projection", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-principals-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const sessions = new RuntimeAuthSessionStore(database);
      const user = await users.ensureFirstAdminUser({ displayName: "Admin" });
      const created = await sessions.createSession(user.id);
      const service = new AuthPrincipalService({
        issuer: "http://localhost:8080",
        trustedIssuers: ["http://localhost:8080"],
        allowLocalhostIssuers: true,
        users,
        identities: new AuthIdentityStore(database.db),
        sessions,
        ensureFirstAdminUser: (): Promise<AuthUser> =>
          users.ensureFirstAdminUser(),
        getJwks: async (): Promise<{ keys: [] }> => ({ keys: [] }),
      });

      expect(
        await service.resolveSession(
          new Request("http://localhost:8080/admin", {
            headers: { cookie: created.cookie.split(";")[0] ?? "" },
          }),
        ),
      ).toMatchObject({
        userId: user.id,
        permissionLevel: "admin",
        isAnchor: true,
      });
    } finally {
      await database.stop();
    }
  });
});
