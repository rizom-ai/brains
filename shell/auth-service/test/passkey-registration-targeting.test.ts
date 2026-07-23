import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  AuthCredentialStore,
  AuthRuntimeDatabase,
  AuthUserStore,
  PasskeyService,
} from "../src";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("targeted passkey registration", () => {
  it("excludes only credentials already owned by the target user", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "passkey-targeting-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    const users = new AuthUserStore(database.db);
    const target = await users.createUser({ displayName: "Target" });
    const other = await users.createUser({ displayName: "Other" });
    const credentials = new AuthCredentialStore(database.db);
    const now = Date.now();
    await credentials.addPasskey({
      id: "target-credential",
      userId: target.id,
      publicKey: "target-public-key",
      counter: 0,
      credentialBackedUp: false,
      createdAt: now,
      updatedAt: now,
    });
    await credentials.addPasskey({
      id: "other-credential",
      userId: other.id,
      publicKey: "other-public-key",
      counter: 0,
      credentialBackedUp: false,
      createdAt: now,
      updatedAt: now,
    });
    const service = new PasskeyService({ runtimeDatabase: database });

    const options = await service.generateRegistrationOptions(
      { origin: "https://brain.example.com", rpID: "brain.example.com" },
      { subject: target.id, userName: "Target" },
    );

    expect(options.excludeCredentials).toEqual([
      expect.objectContaining({ id: "target-credential" }),
    ]);
    expect(options.authenticatorSelection?.residentKey).toBe("required");
    await database.stop();
  });

  it("lets the authenticator choose between multiple discoverable accounts", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "passkey-targeting-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    const users = new AuthUserStore(database.db);
    const anchor = await users.createUser({
      displayName: "Anchor",
      role: "admin",
    });
    const trusted = await users.createUser({
      displayName: "Trusted",
      role: "trusted",
    });
    const credentials = new AuthCredentialStore(database.db);
    const now = Date.now();
    for (const [id, userId] of [
      ["anchor-credential", anchor.id],
      ["trusted-credential", trusted.id],
    ] as const) {
      await credentials.addPasskey({
        id,
        userId,
        publicKey: `${id}-public-key`,
        counter: 0,
        credentialBackedUp: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    const service = new PasskeyService({ runtimeDatabase: database });

    const options = await service.generateAuthenticationOptions({
      origin: "https://brain.example.com",
      rpID: "brain.example.com",
    });

    expect(options.allowCredentials).toBeUndefined();
    expect(options.userVerification).toBe("required");
    await database.stop();
  });

  it("rejects a challenge issued for a different setup-token user", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "passkey-targeting-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    const user = await new AuthUserStore(database.db).createUser({
      displayName: "Mira",
    });
    const service = new PasskeyService({ runtimeDatabase: database });
    const context = {
      origin: "https://brain.example.com",
      rpID: "brain.example.com",
    };
    const options = await service.generateRegistrationOptions(context, {
      subject: user.id,
      userName: "Mira",
      userDisplayName: "Mira",
    });
    const clientDataJSON = Buffer.from(
      JSON.stringify({ challenge: options.challenge }),
    ).toString("base64url");

    const result = await service.verifyRegistrationResponse(
      {
        id: "credential-id",
        rawId: "credential-id",
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON,
          attestationObject: "invalid",
          transports: [],
        },
      } as RegistrationResponseJSON,
      context,
      "usr_someone_else",
    );

    expect(result).toEqual({ verified: false });
    await database.stop();
  });
});
