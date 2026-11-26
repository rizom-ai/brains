import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { z } from "@brains/utils/zod";
import { AuthService } from "../src";
import type { RegisteredOAuthClient } from "../src";

const ISSUER = "https://brain.example.com";
const REDIRECT_URI = "https://matrix.example.com/callback";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeService(): Promise<AuthService> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-oidc-"));
  tempDirs.push(dir);
  return new AuthService({ storageDir: dir, issuer: ISSUER });
}

async function registerClient(
  service: AuthService,
): Promise<RegisteredOAuthClient> {
  return service.registerClient({
    redirect_uris: [REDIRECT_URI],
    client_name: "Homeserver",
  });
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string().optional(),
});

type TokenResponse = z.output<typeof tokenResponseSchema>;

/** Run the authorization-code flow for a user and return the token response. */
async function signIn(
  service: AuthService,
  client: RegisteredOAuthClient,
  options: { userId?: string; scope?: string; nonce?: string } = {},
): Promise<TokenResponse> {
  const verifier = `verifier-${crypto.randomUUID()}`;
  const session = await service.createAuthSession(options.userId);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.nonce ? { nonce: options.nonce } : {}),
  });

  const page = await service.handleRequest(
    new Request(`${ISSUER}/authorize?${params}`, {
      headers: { cookie: session.cookie },
    }),
  );
  expect(page.status).toBe(200);
  const approvalToken = (await page.text()).match(
    /name="approval_token" value="([^"]+)"/,
  )?.[1];
  expect(approvalToken).toBeDefined();
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
  expect(approval.status).toBe(302);
  const code = new URL(approval.headers.get("location") ?? "").searchParams.get(
    "code",
  );

  const token = await service.handleRequest(
    new Request(`${ISSUER}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        client_secret: client.client_secret ?? "",
        code: code ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }).toString(),
    }),
  );
  expect(token.status).toBe(200);
  return tokenResponseSchema.parse(await token.json());
}

async function verifyIdToken(
  service: AuthService,
  idToken: string,
  audience: string,
): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(
    idToken,
    createLocalJWKSet(await service.getJwks()),
    { issuer: ISSUER, audience, algorithms: ["ES256"] },
  );
  return payload;
}

function userinfoRequest(accessToken?: string): Request {
  return new Request(`${ISSUER}/userinfo`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

const userinfoSchema = z.looseObject({
  sub: z.string(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
});

async function userinfo(
  service: AuthService,
  accessToken: string,
): Promise<z.output<typeof userinfoSchema>> {
  const response = await service.handleRequest(userinfoRequest(accessToken));
  expect(response.status).toBe(200);
  return userinfoSchema.parse(await response.json());
}

describe("OpenID Connect discovery", () => {
  it("publishes a discovery document that lists only what the server issues", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      new Request(`${ISSUER}/.well-known/openid-configuration`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      claims_supported: [
        "iss",
        "sub",
        "aud",
        "exp",
        "iat",
        "nonce",
        "name",
        "preferred_username",
      ],
    });
  });

  it("advertises the userinfo endpoint in the OAuth metadata too", async () => {
    const service = await makeService();

    expect(service.getAuthorizationServerMetadata()).toMatchObject({
      userinfo_endpoint: `${ISSUER}/userinfo`,
      scopes_supported: expect.arrayContaining(["openid", "profile"]),
    });
  });
});

describe("ID tokens", () => {
  it("issues a signed ID token with the nonce and profile claims when openid is in scope", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const user = await service.createUser({ displayName: "José Núñez" });

    const tokens = await signIn(service, client, {
      userId: user.userId,
      scope: "openid email profile",
      nonce: "nonce-123",
    });

    expect(tokens.id_token).toBeDefined();
    const claims = await verifyIdToken(
      service,
      tokens.id_token ?? "",
      client.client_id,
    );
    expect(claims).toMatchObject({
      iss: ISSUER,
      sub: user.userId,
      aud: client.client_id,
      nonce: "nonce-123",
      name: "José Núñez",
      preferred_username: "jose-nunez",
    });
  });

  it("leaves profile claims out without the profile scope", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const user = await service.createUser({ displayName: "Mira" });

    const tokens = await signIn(service, client, {
      userId: user.userId,
      scope: "openid",
    });

    const claims = decodeJwt(tokens.id_token ?? "");
    expect(claims.sub).toBe(user.userId);
    expect(claims["preferred_username"]).toBeUndefined();
    expect(claims["name"]).toBeUndefined();
    expect(claims["nonce"]).toBeUndefined();
  });

  it("issues no ID token without openid in scope", async () => {
    const service = await makeService();
    const client = await registerClient(service);

    const tokens = await signIn(service, client, { scope: "mcp" });

    expect(tokens.id_token).toBeUndefined();
  });

  it("issues an ID token without a nonce on refresh", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const tokens = await signIn(service, client, {
      scope: "openid profile",
      nonce: "first-nonce",
    });

    const refreshed = await service.handleRequest(
      new Request(`${ISSUER}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          client_secret: client.client_secret ?? "",
          refresh_token: tokens.refresh_token,
        }).toString(),
      }),
    );

    expect(refreshed.status).toBe(200);
    const body = tokenResponseSchema.parse(await refreshed.json());
    const claims = await verifyIdToken(
      service,
      body.id_token ?? "",
      client.client_id,
    );
    expect(claims["nonce"]).toBeUndefined();
    expect(claims["preferred_username"]).toBeDefined();
  });
});

describe("userinfo", () => {
  it("returns the same subject and profile claims as the ID token", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const user = await service.createUser({ displayName: "Ada Lovelace" });
    const tokens = await signIn(service, client, {
      userId: user.userId,
      scope: "openid profile",
    });

    const info = await userinfo(service, tokens.access_token);

    expect(info).toEqual({
      sub: user.userId,
      name: "Ada Lovelace",
      preferred_username: "ada-lovelace",
    });
    expect(decodeJwt(tokens.id_token ?? "").sub).toBe(info.sub);
  });

  it("answers POST as well as GET", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const tokens = await signIn(service, client, { scope: "openid" });

    const response = await service.handleRequest(
      new Request(`${ISSUER}/userinfo`, {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );

    expect(response.status).toBe(200);
  });

  it("refuses a request without a bearer token", async () => {
    const service = await makeService();

    const response = await service.handleRequest(userinfoRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("refuses an invalid bearer token", async () => {
    const service = await makeService();

    const response = await service.handleRequest(userinfoRequest("not-a-jwt"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    );
  });

  it("refuses an access token issued without openid", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const tokens = await signIn(service, client, { scope: "mcp" });

    const response = await service.handleRequest(
      userinfoRequest(tokens.access_token),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope"',
    );
  });
});

describe("preferred_username", () => {
  it("stays the same after the display name changes", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const user = await service.createUser({ displayName: "Mira" });
    const first = await signIn(service, client, {
      userId: user.userId,
      scope: "openid profile",
    });
    const session = await service.createAuthSession(user.userId);
    const renamed = await service.handleRequest(
      new Request(`${ISSUER}/auth/account/mutations`, {
        method: "POST",
        headers: {
          cookie: session.cookie.split(";")[0] ?? "",
          "content-type": "application/json",
          origin: ISSUER,
        },
        body: JSON.stringify({
          action: "updateDisplayName",
          confirmation: "updateDisplayName",
          displayName: "Mira Renamed",
        }),
      }),
    );
    expect(renamed.status).toBe(200);

    const second = await signIn(service, client, {
      userId: user.userId,
      scope: "openid profile",
    });

    expect(
      (await userinfo(service, first.access_token)).preferred_username,
    ).toBe("mira");
    expect(await userinfo(service, second.access_token)).toMatchObject({
      name: "Mira Renamed",
      preferred_username: "mira",
    });
  });

  it("is unique across people with the same display name", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const first = await service.createUser({ displayName: "Ada Lovelace" });
    const second = await service.createUser({ displayName: "Ada Lovelace" });

    const firstTokens = await signIn(service, client, {
      userId: first.userId,
      scope: "openid profile",
    });
    const secondTokens = await signIn(service, client, {
      userId: second.userId,
      scope: "openid profile",
    });

    expect(
      (await userinfo(service, firstTokens.access_token)).preferred_username,
    ).toBe("ada-lovelace");
    expect(
      (await userinfo(service, secondTokens.access_token)).preferred_username,
    ).toBe("ada-lovelace-2");
  });

  it("falls back to a generic name when the display name has no usable characters", async () => {
    const service = await makeService();
    const client = await registerClient(service);
    const user = await service.createUser({ displayName: "李小龍" });

    const tokens = await signIn(service, client, {
      userId: user.userId,
      scope: "openid profile",
    });

    expect(
      (await userinfo(service, tokens.access_token)).preferred_username,
    ).toBe("user");
  });
});
