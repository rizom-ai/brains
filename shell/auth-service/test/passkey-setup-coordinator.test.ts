import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthAuditStore } from "../src/audit-store";
import { AuthIdentityStore } from "../src/identity-store";
import { PasskeyService } from "../src/passkey-service";
import { PasskeySetupCoordinator } from "../src/passkey-setup-coordinator";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { SetupFlow } from "../src/setup-flow";
import { RuntimeSetupStateStore } from "../src/setup-state-store";
import { TargetedSetupService } from "../src/targeted-setup-service";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("PasskeySetupCoordinator", () => {
  it("owns delivery-bound registration setup without exposing the destination", async () => {
    const storageDir = await mkdtemp(
      join(tmpdir(), "brains-setup-coordinator-"),
    );
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const identities = new AuthIdentityStore(database.db);
      const setupFlow = new SetupFlow({
        setupStateStore: new RuntimeSetupStateStore(database),
        passkeyService: new PasskeyService({ runtimeDatabase: database }),
      });
      const coordinator = new PasskeySetupCoordinator({
        issuer: "https://brain.example.com",
        users,
        identities,
        audit: new AuthAuditStore(database.db),
        setupFlow,
        targetedSetup: new TargetedSetupService(database.db, identities),
      });
      const user = await users.createUser({
        displayName: "Invited Person",
        role: "trusted",
        status: "invited",
      });

      const registration = await coordinator.startRegistration(
        user.id,
        {},
        { type: "email", subject: "person@example.com" },
      );

      expect(
        registration.setupUrl.startsWith(
          "https://brain.example.com/setup?token=setup_",
        ),
      ).toBeTrue();
      expect(registration.setupUrl.includes("person@example.com")).toBeFalse();
      expect(registration.delivery).toEqual({
        type: "email",
        label: "Email address",
      });
    } finally {
      await database.stop();
    }
  });
});
