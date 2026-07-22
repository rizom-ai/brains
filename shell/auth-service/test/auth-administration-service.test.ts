import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAdministrationService } from "../src/administration-service";
import { AuthAuditStore } from "../src/audit-store";
import { AuthCredentialStore } from "../src/credential-store";
import { AuthIdentityStore } from "../src/identity-store";
import { PersonExternalPeerStore } from "../src/person-external-peer-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserManagementService } from "../src/user-management-service";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthAdministrationService", () => {
  it("owns bulk Admin roster projection", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-administration-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const audit = new AuthAuditStore(database.db);
      const management = new AuthUserManagementService({
        users,
        audit,
        sessions: { revokeSessionsForSubject: async (): Promise<number> => 0 },
        refreshTokens: {
          revokeTokensForSubject: async (): Promise<number> => 0,
        },
      });
      const service = new AuthAdministrationService({
        configuredAnchorKind: "person",
        users,
        identities: new AuthIdentityStore(database.db),
        credentials: new AuthCredentialStore(database.db),
        externalPeers: new PersonExternalPeerStore(database.db),
        audit,
        management,
        startPasskeyRegistration: async (): Promise<never> => {
          throw new Error("not used");
        },
      });
      const admin = await users.ensureFirstAdminUser({ displayName: "Admin" });

      expect(await service.listAdminUsers()).toEqual([
        expect.objectContaining({
          userId: admin.id,
          personId: admin.personId,
          permissionLevel: "admin",
          isAnchor: true,
          identities: [],
          passkeys: [],
          externalPeers: [],
        }),
      ]);
    } finally {
      await database.stop();
    }
  });
});
