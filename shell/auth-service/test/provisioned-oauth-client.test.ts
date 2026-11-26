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

const MATRIX_CLIENT = {
  ...CLIENT,
  identityClaim: {
    type: "matrix",
    subjectPrefix: "@",
    subjectSuffix: ":brain.example.com",
  },
};

async function pkce(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

/** Sign a user in through a provisioned client and redeem the code. */
async function signInThrough(
  service: AuthService,
  client: { clientId: string; clientSecret: string; redirectUris: string[] },
  userId: string,
): Promise<Response> {
  const verifier = `verifier-${crypto.randomUUID()}`;
  const session = await service.createAuthSession(userId);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0] ?? "",
    code_challenge: await pkce(verifier),
    code_challenge_method: "S256",
    scope: "openid profile",
  });
  const page = await service.handleRequest(
    new Request(`${ISSUER}/authorize?${params}`, {
      headers: { cookie: session.cookie },
    }),
  );
  const approvalToken = (await page.text()).match(
    /name="approval_token" value="([^"]+)"/,
  )?.[1];
  params.set("approval_token", approvalToken ?? "");
  const approval = await service.handleRequest(
    new Request(`${ISSUER}/authorize`, {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }),
  );
  const code = new URL(approval.headers.get("location") ?? "").searchParams.get(
    "code",
  );
  return service.handleRequest(
    new Request(`${ISSUER}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code: code ?? "",
        redirect_uri: client.redirectUris[0] ?? "",
        code_verifier: verifier,
      }).toString(),
    }),
  );
}

describe("a provisioned client's identity claim", () => {
  it("records the identity a sign-in through the client proves, once and verified", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
      isChannelTypeRegistered: (type): boolean => type === "matrix",
    });
    await service.provisionOAuthClient(MATRIX_CLIENT);
    const user = await service.createUser({ displayName: "Ada Lovelace" });

    expect(
      (await signInThrough(service, MATRIX_CLIENT, user.userId)).status,
    ).toBe(200);
    expect(
      (await signInThrough(service, MATRIX_CLIENT, user.userId)).status,
    ).toBe(200);

    const claims = (await service.listUserIdentities(user.userId)).filter(
      (identity) => identity.type === "matrix",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      label: "@ada-lovelace:brain.example.com",
      evidence: [
        expect.objectContaining({
          sourceKind: "provider",
          sourceId: "matrix-homeserver",
          assurance: "verified",
        }),
      ],
    });
  });

  it("records nothing for a client that declares no identity", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
      isChannelTypeRegistered: (type): boolean => type === "matrix",
    });
    await service.provisionOAuthClient(CLIENT);
    const user = await service.createUser({ displayName: "Ada Lovelace" });

    await signInThrough(service, CLIENT, user.userId);

    expect(
      (await service.listUserIdentities(user.userId)).filter(
        (identity) => identity.type === "matrix",
      ),
    ).toEqual([]);
  });

  it("still signs the person in when the claim's channel is not registered", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: ISSUER,
      isChannelTypeRegistered: (): boolean => false,
    });
    await service.provisionOAuthClient(MATRIX_CLIENT);
    const user = await service.createUser({ displayName: "Ada Lovelace" });

    const response = await signInThrough(service, MATRIX_CLIENT, user.userId);

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("id_token");
  });
});
