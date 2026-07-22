import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAuditStore } from "../src/audit-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserManagementService } from "../src/user-management-service";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthUserManagementService", () => {
  it("owns role changes, grant revocation, and actor-attributed auditing", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-user-management-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const audit = new AuthAuditStore(database.db);
      const revokedSessions: string[] = [];
      const revokedRefreshTokens: string[] = [];
      const service = new AuthUserManagementService({
        users,
        audit,
        sessions: {
          revokeSessionsForSubject: async (subject): Promise<number> => {
            revokedSessions.push(subject);
            return 1;
          },
        },
        refreshTokens: {
          revokeTokensForSubject: async (subject): Promise<number> => {
            revokedRefreshTokens.push(subject);
            return 2;
          },
        },
      });
      const admin = await users.ensureFirstAdminUser();
      const managed = await users.createUser({
        displayName: "Managed User",
        role: "public",
      });

      const updated = await service.updateRole(managed.id, "trusted", {
        actorUserId: admin.id,
      });

      expect(updated).toMatchObject({ id: managed.id, role: "trusted" });
      expect(revokedSessions).toEqual([managed.id]);
      expect(revokedRefreshTokens).toEqual([managed.id]);
      expect(await audit.list()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actorUserId: admin.id,
            action: "auth.user.role_updated",
            targetId: managed.id,
            metadata: { from: "public", to: "trusted" },
          }),
        ]),
      );
    } finally {
      await database.stop();
    }
  });
});
