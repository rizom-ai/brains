import { afterEach, describe, expect, it } from "bun:test";
import type { RuntimeInterfacePrincipalState } from "@brains/contracts";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthAuditStore } from "../src/audit-store";
import { InterfaceAccessAdministrationService } from "../src/interface-access-administration-service";
import { InterfacePrincipalStore } from "../src/interface-principal-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("InterfaceAccessAdministrationService", () => {
  it("publishes DB state and actor-attributed audits without exposing principal keys", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-access-admin-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const actor = await users.ensureFirstAdminUser();
      const audit = new AuthAuditStore(database.db);
      const published: RuntimeInterfacePrincipalState[] = [];
      const service = new InterfaceAccessAdministrationService({
        store: new InterfacePrincipalStore(database.db),
        audit,
        publishState: (state): void => {
          published.push(state);
        },
      });

      const grant = await service.upsertGrant(
        {
          interfaceType: "discord",
          subject: "123456789",
          label: "Operations room",
          permissionLevel: "trusted",
        },
        { actorUserId: actor.id },
      );

      expect(grant).toMatchObject({
        interfaceType: "discord",
        label: "Operations room",
        permissionLevel: "trusted",
      });
      expect(JSON.stringify(grant)).not.toContain("123456789");
      expect(JSON.stringify(grant)).not.toMatch(/[a-f0-9]{64}/);
      expect(published.at(-1)?.grants).toHaveLength(1);
      expect(await audit.list()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actorUserId: actor.id,
            action: "auth.interface_grant.upserted",
            targetId: grant.id,
            metadata: {
              interfaceType: "discord",
              permissionLevel: "trusted",
              label: "Operations room",
            },
          }),
        ]),
      );

      await service.revokeGrant(grant.id, { actorUserId: actor.id });
      expect(published.at(-1)?.grants).toEqual([]);
      expect(await service.listGrants()).toEqual([]);
      expect(await audit.list()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actorUserId: actor.id,
            action: "auth.interface_grant.revoked",
            targetId: grant.id,
          }),
        ]),
      );
    } finally {
      await database.stop();
    }
  });
});
