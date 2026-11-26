import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import {
  AuthRuntimeDatabase,
  AuthService,
  RuntimeOAuthClientStore,
} from "../src";
import { oauthClients } from "../src/runtime-schema";

const ISSUER = "https://brain.example.com";
const CLIENT = {
  clientId: "matrix-homeserver",
  clientSecret: "provisioned-secret-0123456789abcdef",
  clientName: "Matrix homeserver",
  redirectUris: [
    "https://brain.example.com/_matrix/client/unstable/login/sso/callback/matrix-homeserver",
  ],
};

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-provisioned-client-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** The OAuth error a revoke request gets, or undefined when it succeeds. */
async function revokeError(
  service: AuthService,
  clientId: string,
  clientSecret: string,
): Promise<string | undefined> {
  const response = await service.handleRequest(
    revokeRequest(clientId, clientSecret),
  );
  if (response.status === 200) return undefined;
  const body: unknown = await response.json();
  return typeof body === "object" && body !== null && "error" in body
    ? String(body.error)
    : `status ${response.status}`;
}

function revokeRequest(clientId: string, clientSecret: string): Request {
  return new Request(`${ISSUER}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: "unknown-token",
    }).toString(),
  });
}

describe("provisioned OAuth clients", () => {
  it("registers a confidential client under the chosen id and secret", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
    });

    await service.provisionOAuthClient(CLIENT);

    expect(await service.getRegisteredClient(CLIENT.clientId)).toMatchObject({
      client_id: CLIENT.clientId,
      client_name: CLIENT.clientName,
      redirect_uris: CLIENT.redirectUris,
    });
    expect(
      await revokeError(service, CLIENT.clientId, CLIENT.clientSecret),
    ).toBeUndefined();
    expect(await revokeError(service, CLIENT.clientId, "wrong")).toBe(
      "invalid_client",
    );
  });

  it("replaces the secret and redirect URIs when provisioned again", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
    });
    await service.provisionOAuthClient(CLIENT);

    const rotated = {
      ...CLIENT,
      clientSecret: "rotated-secret-0123456789abcdefgh",
      redirectUris: ["https://brain.example.com/new-callback"],
    };
    await service.provisionOAuthClient(rotated);

    expect(
      await revokeError(service, CLIENT.clientId, CLIENT.clientSecret),
    ).toBe("invalid_client");
    expect(
      await revokeError(service, CLIENT.clientId, rotated.clientSecret),
    ).toBeUndefined();
    expect(
      (await service.getRegisteredClient(CLIENT.clientId))?.redirect_uris,
    ).toEqual(rotated.redirectUris);
  });

  it("is available on every issuer the brain answers on", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
    });
    await service.provisionOAuthClient(CLIENT);

    const response = await service.handleRequest(
      new Request("https://preview.brain.example.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT.clientId,
          client_secret: CLIENT.clientSecret,
          token: "unknown-token",
        }).toString(),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("refuses ids that could collide with registered or metadata-document clients", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
    });

    for (const clientId of [
      "oc_matrix",
      "https://client.example/meta.json",
      "Matrix",
      "ab",
    ]) {
      expect(
        service.provisionOAuthClient({ ...CLIENT, clientId }),
      ).rejects.toThrow();
    }
  });

  it("refuses a short secret", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
    });

    expect(
      service.provisionOAuthClient({ ...CLIENT, clientSecret: "short" }),
    ).rejects.toThrow();
  });

  it("is never pruned as a stale unconsented client", async () => {
    const database = new AuthRuntimeDatabase({
      storageDir: await tempStorageDir(),
    });
    await database.start();
    try {
      const clients = new RuntimeOAuthClientStore(database);
      await clients.provisionClient(CLIENT);
      const longAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      await database.db
        .update(oauthClients)
        .set({ createdAt: longAgo, updatedAt: longAgo })
        .where(eq(oauthClients.clientId, CLIENT.clientId));

      const pruned = await clients.pruneStaleUnconsentedClients(
        Math.floor(Date.now() / 1000),
      );

      expect(pruned).toBe(0);
      expect(await clients.getClient(CLIENT.clientId)).toBeDefined();
    } finally {
      await database.stop();
    }
  });
});
