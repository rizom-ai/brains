import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { AuthRuntimeDatabase, AuthUserStore, PasskeyService } from "../src";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("targeted passkey registration", () => {
  it("rejects a challenge issued for a different setup-token user", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "passkey-targeting-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    const user = await new AuthUserStore(database.db).createUser({
      displayName: "Mira",
    });
    const service = new PasskeyService({
      storageDir,
      runtimeDatabase: database,
    });
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
