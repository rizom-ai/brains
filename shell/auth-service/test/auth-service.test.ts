import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService, normalizeIssuer } from "../src";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-service-"));
  tempDirs.push(dir);
  return dir;
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthService", () => {
  it("normalizes issuer origins", () => {
    expect(normalizeIssuer("https://brain.example.com/")).toBe(
      "https://brain.example.com",
    );
    expect(() => normalizeIssuer("https://brain.example.com/auth")).toThrow(
      "OAuth issuer must be an origin",
    );
  });

  it("generates and reuses an ES256 public JWKS key", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });

    const first = await service.getJwks();
    const secondService = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    const second = await secondService.getJwks();

    expect(first.keys).toHaveLength(1);
    expect(first.keys[0]).toMatchObject({
      kty: "EC",
      crv: "P-256",
      use: "sig",
      alg: "ES256",
    });
    expect(first.keys[0]?.["d"]).toBeUndefined();
    expect(second.keys[0]?.kid).toBe(first.keys[0]?.kid);

    const keyStats = await stat(join(storageDir, "oauth-signing-key.jwk"));
    expect(keyStats.mode & 0o777).toBe(0o600);
  });

  it("serves OAuth well-known metadata from request host", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });

    const response = await service.handleWellKnownRequest(
      new Request("http://127.0.0.1/.well-known/oauth-authorization-server", {
        headers: {
          host: "brain.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: "https://brain.example.com",
      authorization_endpoint: "https://brain.example.com/authorize",
      token_endpoint: "https://brain.example.com/token",
      registration_endpoint: "https://brain.example.com/register",
      jwks_uri: "https://brain.example.com/.well-known/jwks.json",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("serves setup page and registration options before passkey enrollment", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "http://localhost:8080",
    });

    await service.initialize();
    const setupUrl = service.getSetupUrl("http://localhost:8080");
    expect(setupUrl).toStartWith("http://localhost:8080/setup?token=setup_");

    const setupPage = await service.handleRequest(new Request(setupUrl ?? ""));
    expect(setupPage.status).toBe(200);
    const setupHtml = await setupPage.text();
    expect(setupHtml).toContain("Set up your brain passkey");

    const optionsResponse = await service.handleRequest(
      new Request(
        `http://localhost:8080/webauthn/register/options?setup_token=${encodeURIComponent(
          new URL(setupUrl ?? "").searchParams.get("token") ?? "",
        )}`,
        {
          method: "POST",
        },
      ),
    );
    expect(optionsResponse.status).toBe(200);
    const options = await optionsResponse.json();
    expect(options).toMatchObject({
      rp: { name: "Brain", id: "localhost" },
      user: { name: "Operator", displayName: "Operator" },
      attestation: "none",
    });
    expect(typeof options.challenge).toBe("string");
    expect(options.authenticatorSelection).toMatchObject({
      userVerification: "required",
    });
  });

  it("hides setup page without the one-shot setup token", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });
    await service.initialize();

    const pageResponse = await service.handleRequest(
      new Request("http://localhost:8080/setup"),
    );
    expect(pageResponse.status).toBe(404);

    const optionsResponse = await service.handleRequest(
      new Request("http://localhost:8080/webauthn/register/options", {
        method: "POST",
      }),
    );
    expect(optionsResponse.status).toBe(400);
    const error = await optionsResponse.json();
    expect(error).toMatchObject({
      error: "access_denied",
      error_description: "Invalid setup token",
    });
  });

  it("rejects passkey authentication options before setup", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://localhost:8080",
    });

    const response = await service.handleRequest(
      new Request("http://localhost:8080/webauthn/auth/options", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toMatchObject({
      error: "access_denied",
      error_description: "No passkey registered",
    });
  });

  it("registers and persists a public OAuth client", async () => {
    const storageDir = await tempStorageDir();
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
          client_name: "Claude Desktop",
          scope: "openid profile mcp offline_access",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const client = await response.json();
    expect(client).toMatchObject({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      client_name: "Claude Desktop",
      scope: "openid profile mcp offline_access",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    expect(client.client_id).toStartWith("oc_");
    expect(client.client_secret).toBeUndefined();

    const clientStats = await stat(join(storageDir, "oauth-clients.json"));
    expect(clientStats.mode & 0o777).toBe(0o600);

    const secondService = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    const persistedClient = await secondService.getRegisteredClient(
      client.client_id,
    );
    expect(persistedClient).toMatchObject({
      client_id: client.client_id,
      client_name: "Claude Desktop",
    });

    const store = JSON.parse(
      await readFile(join(storageDir, "oauth-clients.json"), "utf8"),
    ) as { clients: unknown[] };
    expect(store.clients).toHaveLength(1);
  });

  it("issues an authorization code and exchanges it for a bearer token", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const registerResponse = await service.handleRequest(
      new Request("https://brain.example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
          client_name: "Claude Desktop",
        }),
      }),
    );
    const client = await registerResponse.json();
    const verifier =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = await pkceChallenge(verifier);
    const authorizeUrl = new URL("https://brain.example.com/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client.client_id);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1:6274/oauth/callback",
    );
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("state", "state-123");
    authorizeUrl.searchParams.set("scope", "openid profile mcp");

    const session = await service.createOperatorSession();
    const pageResponse = await service.handleRequest(
      new Request(authorizeUrl.toString(), {
        headers: { cookie: session.cookie },
      }),
    );
    expect(pageResponse.status).toBe(200);
    const page = await pageResponse.text();
    expect(page).toContain("Authorize Claude Desktop");

    const approveResponse = await service.handleRequest(
      new Request("https://brain.example.com/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: session.cookie,
        },
        body: authorizeUrl.searchParams.toString(),
      }),
    );
    expect(approveResponse.status).toBe(302);
    const redirect = new URL(approveResponse.headers.get("location") ?? "");
    expect(redirect.origin + redirect.pathname).toBe(
      "http://127.0.0.1:6274/oauth/callback",
    );
    expect(redirect.searchParams.get("state")).toBe("state-123");
    const code = redirect.searchParams.get("code");
    expect(code).toStartWith("ocd_");

    const tokenResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          code: code ?? "",
          code_verifier: verifier,
        }).toString(),
      }),
    );

    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(token).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "openid profile mcp",
    });
    expect(token.access_token.split(".")).toHaveLength(3);
    expect(token.refresh_token).toStartWith("ort_");

    const refreshResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token,
        }).toString(),
      }),
    );
    expect(refreshResponse.status).toBe(200);
    const refreshed = await refreshResponse.json();
    expect(refreshed).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "openid profile mcp",
    });
    expect(refreshed.access_token.split(".")).toHaveLength(3);
    expect(refreshed.refresh_token).toStartWith("ort_");
    expect(refreshed.refresh_token).not.toBe(token.refresh_token);

    const reusedRefreshResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token,
        }).toString(),
      }),
    );
    expect(reusedRefreshResponse.status).toBe(400);

    const revokeResponse = await service.handleRequest(
      new Request("https://brain.example.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client.client_id,
          token: refreshed.refresh_token,
        }).toString(),
      }),
    );
    expect(revokeResponse.status).toBe(200);

    const revokedRefreshResponse = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: refreshed.refresh_token,
        }).toString(),
      }),
    );
    expect(revokedRefreshResponse.status).toBe(400);
  });

  it("requires an operator session before showing the authorize page", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      client_name: "Claude Desktop",
    });
    const authorizeUrl = new URL("https://brain.example.com/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client.client_id);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1:6274/oauth/callback",
    );
    authorizeUrl.searchParams.set(
      "code_challenge",
      await pkceChallenge("verifier"),
    );
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await service.handleRequest(
      new Request(authorizeUrl.toString()),
    );

    expect(response.status).toBe(401);
    const html = await response.text();
    expect(html).toContain("Operator login required");
  });

  it("rejects invalid PKCE verifiers", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
    });
    const challenge = await pkceChallenge("correct-verifier");
    const code = await service["authCodeStore"].createCode({
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:6274/oauth/callback",
      codeChallenge: challenge,
      subject: "single-operator",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          code: code.code,
          code_verifier: "wrong-verifier",
        }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toMatchObject({ error: "invalid_grant" });
  });

  it("rejects invalid client metadata", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const response = await service.handleRequest(
      new Request("https://brain.example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["not a url"] }),
      }),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("serves MCP protected-resource metadata", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const response = await service.handleWellKnownRequest(
      new Request(
        "https://brain.example.com/.well-known/oauth-protected-resource",
      ),
    );

    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toEqual({
      resource: "https://brain.example.com",
      authorization_servers: ["https://brain.example.com"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["ES256"],
    });
  });
});
