import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { AuthIdentityStore } from "../src/identity-store";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { AuthUserStore } from "../src/user-store";
import { registeredTestChannels } from "./fixtures/registered-channels";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthIdentityStore", () => {
  it("accepts reserved and registered channel types while rejecting unknown types", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-identities-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const identities = new AuthIdentityStore(database.db, {
        isChannelTypeRegistered: (type): boolean => type === "slack",
      });
      const user = await users.createUser({ displayName: "Identity Owner" });

      expect(
        await identities.attachIdentity({
          userId: user.id,
          type: "slack",
          subject: "U123ABC",
        }),
      ).toMatchObject({ type: "slack" });
      let unsupportedError: unknown;
      try {
        await identities.attachIdentity({
          userId: user.id,
          type: "unknown-channel",
          subject: "subject",
        });
      } catch (error) {
        unsupportedError = error;
      }
      expect(unsupportedError).toBeInstanceOf(Error);
      expect(getErrorMessage(unsupportedError, "")).toBe(
        'Unsupported auth identity type: "unknown-channel"',
      );
      expect(
        await identities.attachIdentity({
          userId: user.id,
          type: "passkey",
          subject: "credential-1",
        }),
      ).toMatchObject({ type: "passkey" });
    } finally {
      await database.stop();
    }
  });

  it("admits only reserved types when no channel registry is given", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-identities-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const user = await new AuthUserStore(database.db).createUser({
        displayName: "Identity Owner",
      });
      const identities = new AuthIdentityStore(database.db);

      const refused = await identities
        .attachIdentity({
          userId: user.id,
          type: "email",
          subject: "owner@example.com",
        })
        .then(
          () => "",
          (error: unknown) => getErrorMessage(error, ""),
        );
      expect(refused).toBe('Unsupported auth identity type: "email"');
      expect(
        await identities.attachIdentity({
          userId: user.id,
          type: "passkey",
          subject: "credential-1",
        }),
      ).toMatchObject({ type: "passkey" });
    } finally {
      await database.stop();
    }
  });

  it("owns identity claims, evidence, and access resolution independently", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-identities-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    try {
      const users = new AuthUserStore(database.db);
      const identities = new AuthIdentityStore(
        database.db,
        registeredTestChannels,
      );
      const user = await users.createUser({ displayName: "Identity Owner" });

      const identity = await identities.attachIdentity({
        userId: user.id,
        type: "email",
        subject: "OWNER@Example.com",
        verifiedAt: 123,
        source: { kind: "provider", id: "email" },
      });

      expect(identity).toMatchObject({
        personId: user.personId,
        verifiedAt: 123,
      });
      expect(
        await identities.resolveIdentityAccess({
          type: "email",
          subject: "owner@example.com",
        }),
      ).toMatchObject({ state: "resolved", user: { id: user.id } });
    } finally {
      await database.stop();
    }
  });
});
