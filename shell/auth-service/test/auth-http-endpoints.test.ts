import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService, PasskeyStore } from "../src";
import type { RegisteredOAuthClient } from "../src";

/**
 * Characterization tests for AuthService HTTP routing and error envelopes
 * (shell-cleanup plan, phase 2). These pin current behavior ahead of
 * decomposing auth-service.ts; the extraction step must not modify them.
 */

const ISSUER = "https://brain.example.com";
const REDIRECT_URI = "http://127.0.0.1:6274/oauth/callback";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-endpoints-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeService(): Promise<AuthService> {
  return new AuthService({
    storageDir: await tempStorageDir(),
    issuer: ISSUER,
  });
}

async function registerTestClient(
  service: AuthService,
): Promise<RegisteredOAuthClient> {
  return service.registerClient({
    redirect_uris: [REDIRECT_URI],
    client_name: "Test Client",
  });
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

async function seedPasskeyCredential(storageDir: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await new PasskeyStore({ storageDir }).addCredential({
    id: "credential-id",
    public_key: Buffer.from("public-key").toString("base64url"),
    counter: 0,
    subject: "single-operator",
    user_name: "Operator",
    credential_device_type: "singleDevice",
    credential_backed_up: false,
    created_at: now,
    updated_at: now,
  });
}

function tokenRequest(body: Record<string, string>): Request {
  return new Request(`${ISSUER}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

function authorizeParams(
  client: RegisteredOAuthClient,
  challenge: string,
  overrides: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...overrides,
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") params.delete(key);
  }
  return params;
}

describe("AuthService routing", () => {
  it("returns 404 for unknown paths and unrouted methods", async () => {
    const service = await makeService();

    const unknownPath = await service.handleRequest(
      new Request(`${ISSUER}/nope`),
    );
    expect(unknownPath.status).toBe(404);
    expect(await unknownPath.text()).toBe("Not Found");

    const wrongMethod = await service.handleRequest(
      new Request(`${ISSUER}/token`, { method: "GET" }),
    );
    expect(wrongMethod.status).toBe(404);
  });

  it("returns the operator login challenge response", async () => {
    const service = await makeService();

    const response = service.createOperatorLoginResponse(
      new Request(`${ISSUER}/dashboard?tab=jobs`),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("Operator login required");
    expect(html).toContain(JSON.stringify("/dashboard?tab=jobs"));
  });

  it("verifyBearerToken returns undefined without an Authorization header", async () => {
    const service = await makeService();

    const verified = await service.verifyBearerToken(
      new Request(`${ISSUER}/mcp`),
    );

    expect(verified).toBeUndefined();
  });
});

describe("login page", () => {
  it("renders the passkey login page with a relative return_to", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      new Request(`${ISSUER}/login?return_to=/dashboard`),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Operator login");
    expect(html).toContain("Continue with passkey");
    expect(html).toContain(JSON.stringify("/dashboard"));
  });

  it("sanitizes absolute and protocol-relative return_to values", async () => {
    const service = await makeService();

    for (const returnTo of ["https://evil.example", "//evil.example"]) {
      const response = await service.handleRequest(
        new Request(
          `${ISSUER}/login?return_to=${encodeURIComponent(returnTo)}`,
        ),
      );
      const html = await response.text();
      expect(html).not.toContain("evil.example");
      expect(html).toContain(JSON.stringify("/"));
    }
  });
});

describe("authorize request validation", () => {
  async function authorizePageResponse(
    service: AuthService,
    params: URLSearchParams,
  ): Promise<Response> {
    const session = await service.createOperatorSession();
    return service.handleRequest(
      new Request(`${ISSUER}/authorize?${params}`, {
        headers: { cookie: session.cookie },
      }),
    );
  }

  it("rejects unsupported response_type", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);
    const params = authorizeParams(client, await pkceChallenge("v"), {
      response_type: "token",
    });

    const response = await authorizePageResponse(service, params);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Unsupported response_type");
  });

  it("rejects missing required parameters", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);
    const challenge = await pkceChallenge("v");
    const cases: Array<[string, string]> = [
      ["client_id", "Missing client_id"],
      ["redirect_uri", "Missing redirect_uri"],
      ["code_challenge", "Missing code_challenge"],
    ];

    for (const [missing, error] of cases) {
      const params = authorizeParams(client, challenge);
      params.delete(missing);
      const response = await authorizePageResponse(service, params);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe(error);
    }
  });

  it("rejects non-S256 code challenge methods", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);
    const params = authorizeParams(client, await pkceChallenge("v"), {
      code_challenge_method: "plain",
    });

    const response = await authorizePageResponse(service, params);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Unsupported code_challenge_method");
  });

  it("rejects unknown clients and unregistered redirect URIs", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);
    const challenge = await pkceChallenge("v");

    const unknownClient = authorizeParams(client, challenge, {
      client_id: "oc_unknown",
    });
    const unknownResponse = await authorizePageResponse(service, unknownClient);
    expect(unknownResponse.status).toBe(400);
    expect(await unknownResponse.text()).toBe("Unknown client_id");

    const badRedirect = authorizeParams(client, challenge, {
      redirect_uri: "https://evil.example/callback",
    });
    const redirectResponse = await authorizePageResponse(service, badRedirect);
    expect(redirectResponse.status).toBe(400);
    expect(await redirectResponse.text()).toBe("Unregistered redirect_uri");
  });

  it("rejects approval when form parameters differ from the issued token", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);
    const session = await service.createOperatorSession();
    const params = authorizeParams(client, await pkceChallenge("v"), {
      scope: "mcp",
    });

    const pageResponse = await service.handleRequest(
      new Request(`${ISSUER}/authorize?${params}`, {
        headers: { cookie: session.cookie },
      }),
    );
    const approvalToken = (await pageResponse.text()).match(
      /name="approval_token" value="([^"]+)"/,
    )?.[1];
    expect(approvalToken).toStartWith("oat_");

    const tampered = new URLSearchParams(params);
    tampered.set("scope", "mcp offline_access");
    tampered.set("approval_token", approvalToken ?? "");
    const response = await service.handleRequest(
      new Request(`${ISSUER}/authorize`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: tampered.toString(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid authorization approval token");
  });
});

describe("token endpoint", () => {
  it("requires a client_id", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      tokenRequest({ grant_type: "authorization_code" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_request",
      error_description: "client_id is required",
    });
  });

  it("rejects unknown clients", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      tokenRequest({
        grant_type: "authorization_code",
        client_id: "oc_unknown",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_client",
      error_description: "Unknown client_id",
    });
  });

  it("rejects unsupported grant types", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      tokenRequest({
        grant_type: "client_credentials",
        client_id: client.client_id,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "unsupported_grant_type",
    });
  });

  it("requires code, redirect_uri, and code_verifier for the code grant", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      tokenRequest({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: "ocd_something",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_request",
      error_description: "code, redirect_uri, and code_verifier are required",
    });
  });

  it("requires a refresh_token for the refresh grant", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      tokenRequest({
        grant_type: "refresh_token",
        client_id: client.client_id,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_request",
      error_description: "refresh_token is required",
    });
  });

  it("rejects unknown refresh tokens", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      tokenRequest({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: "ort_unknown",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("accepts JSON token request bodies", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      new Request(`${ISSUER}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: "ort_unknown",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("rejects non-Basic client authentication headers", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      new Request(`${ISSUER}/token`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: "Bearer some-token",
        },
        body: new URLSearchParams({ grant_type: "refresh_token" }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_client",
      error_description: "Unsupported client authentication method",
    });
  });

  it("rejects Basic auth that conflicts with the body client_id", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      new Request(`${ISSUER}/token`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${Buffer.from("other-client:secret").toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: "ort_unknown",
        }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_client",
      error_description: "Conflicting client_id values",
    });
  });

  it("rejects malformed Basic auth credentials", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      new Request(`${ISSUER}/token`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${Buffer.from("no-separator").toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "refresh_token" }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_client",
      error_description: "Invalid Basic client authentication",
    });
  });
});

describe("revoke endpoint", () => {
  it("requires a token", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      new Request(`${ISSUER}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: client.client_id }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_request",
      error_description: "token is required",
    });
  });

  it("returns 200 for unknown tokens per RFC 7009", async () => {
    const service = await makeService();
    const client = await registerTestClient(service);

    const response = await service.handleRequest(
      new Request(`${ISSUER}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client.client_id,
          token: "ort_unknown",
        }).toString(),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects unknown clients when a client_id is supplied", async () => {
    const service = await makeService();

    const response = await service.handleRequest(
      new Request(`${ISSUER}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "oc_unknown",
          token: "ort_unknown",
        }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_client",
      error_description: "Unknown client_id",
    });
  });
});

describe("webauthn endpoints", () => {
  it("rejects registration verify without a setup token", async () => {
    const service = await makeService();
    await service.initialize();

    const response = await service.handleRequest(
      new Request(`${ISSUER}/webauthn/register/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "x", response: {} }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "access_denied",
      error_description: "Invalid setup token",
    });
  });

  it("rejects registration verify when no challenge was issued", async () => {
    const service = await makeService();
    await service.initialize();
    const setupToken =
      new URL(service.getSetupUrl() ?? "").searchParams.get("token") ?? "";

    const response = await service.handleRequest(
      new Request(
        `${ISSUER}/webauthn/register/verify?setup_token=${encodeURIComponent(setupToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "x", response: {} }),
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "access_denied",
      error_description: "Passkey registration failed",
    });
  });

  it("rejects registration endpoints after a passkey exists", async () => {
    const storageDir = await tempStorageDir();
    await seedPasskeyCredential(storageDir);
    const service = new AuthService({ storageDir, issuer: ISSUER });

    for (const path of [
      "/webauthn/register/options",
      "/webauthn/register/verify",
    ]) {
      const response = await service.handleRequest(
        new Request(`${ISSUER}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "x", response: {} }),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "access_denied",
        error_description: "Passkey setup already completed",
      });
    }
  });

  it("serves authentication options for a registered passkey", async () => {
    const storageDir = await tempStorageDir();
    await seedPasskeyCredential(storageDir);
    const service = new AuthService({ storageDir, issuer: ISSUER });

    const response = await service.handleRequest(
      new Request(`${ISSUER}/webauthn/auth/options`, { method: "POST" }),
    );

    expect(response.status).toBe(200);
    const options = await response.json();
    expect(typeof options.challenge).toBe("string");
    expect(options.userVerification).toBe("required");
    expect(options.allowCredentials).toEqual([
      { id: "credential-id", type: "public-key" },
    ]);
  });

  it("rejects authentication verify when no challenge was issued", async () => {
    const storageDir = await tempStorageDir();
    await seedPasskeyCredential(storageDir);
    const service = new AuthService({ storageDir, issuer: ISSUER });

    const response = await service.handleRequest(
      new Request(`${ISSUER}/webauthn/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "credential-id", response: {} }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "access_denied",
      error_description: "Passkey authentication failed",
    });
  });
});

describe("setup page", () => {
  it("returns 404 once setup is complete", async () => {
    const storageDir = await tempStorageDir();
    await seedPasskeyCredential(storageDir);
    const service = new AuthService({ storageDir, issuer: ISSUER });

    const response = await service.handleRequest(
      new Request(`${ISSUER}/setup?token=setup_anything`),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Setup already completed");
  });
});
