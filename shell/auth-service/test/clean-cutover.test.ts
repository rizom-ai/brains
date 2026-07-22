import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "../src";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("auth runtime clean cutover", () => {
  it("ignores legacy auth files and starts only from auth.db", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "auth-clean-cutover-"));
    tempDirs.push(storageDir);
    const legacyFiles = new Map<string, string>([
      [
        "oauth-passkeys.json",
        JSON.stringify({
          credentials: [
            {
              id: "legacy-credential",
              public_key:
                Buffer.from("legacy-public-key").toString("base64url"),
              counter: 0,
              subject: "single-operator",
              user_name: "Legacy operator",
              credential_device_type: "singleDevice",
              credential_backed_up: false,
              created_at: 1_700_000_000,
              updated_at: 1_700_000_000,
            },
          ],
          registrationChallenges: [],
          authenticationChallenges: [],
        }),
      ],
      [
        "oauth-clients.json",
        JSON.stringify({
          clients: [
            {
              client_id: "legacy-client",
              client_id_issued_at: 1_700_000_000,
              redirect_uris: ["https://legacy.example/callback"],
              token_endpoint_auth_method: "none",
              grant_types: ["authorization_code", "refresh_token"],
              response_types: ["code"],
            },
          ],
        }),
      ],
      [
        "a2a-peer-trust.json",
        JSON.stringify({
          peers: [
            {
              domain: "legacy.example",
              keyFingerprint: "legacy-fingerprint",
              grantedLevel: "trusted",
            },
          ],
        }),
      ],
      ["oauth-signing-key.jwk", "not-json"],
      ["a2a-signing-key.jwk", "not-json"],
    ]);
    await Promise.all(
      [...legacyFiles].map(([name, contents]) =>
        writeFile(join(storageDir, name), contents),
      ),
    );

    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    const initialized = await service.initialize();
    expect(initialized).toBeUndefined();

    expect(await service.hasPasskeyCredentials()).toBe(false);
    expect(await service.getRegisteredClient("legacy-client")).toBeUndefined();
    expect(await service.getA2APeerTrust("legacy.example")).toBeUndefined();
    await service.close();

    for (const [name, contents] of legacyFiles) {
      expect(await readFile(join(storageDir, name), "utf8")).toBe(contents);
    }

    const client = createClient({ url: `file:${join(storageDir, "auth.db")}` });
    const legacyImportTable = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_legacy_imports'",
    );
    expect(legacyImportTable.rows).toHaveLength(0);
    client.close();
  });
});
